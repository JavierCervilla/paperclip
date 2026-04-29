import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, chatMessages, chatSessions, companies, createDb } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { chatService } from "../services/chat.ts";
import { buildDeterministicChatSummary } from "../services/chat-process.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres chat-resume tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("buildDeterministicChatSummary", () => {
  it("returns empty string for an empty thread", () => {
    expect(buildDeterministicChatSummary({ messages: [], endReason: "user_closed" })).toBe("");
  });

  it("includes counts, first user message, and last agent reply", () => {
    const summary = buildDeterministicChatSummary({
      messages: [
        { sender: "user", content: "Hola, ¿cómo cambio el color del botón?", createdAt: "2026-04-29T10:00:00Z" },
        {
          sender: "agent",
          content: "Edita la clase Tailwind del componente Button.",
          createdAt: "2026-04-29T10:00:05Z",
        },
        { sender: "user", content: "¿Y el tema oscuro?", createdAt: "2026-04-29T10:01:00Z" },
        { sender: "agent", content: "Usa la variante dark: del mismo selector.", createdAt: "2026-04-29T10:01:05Z" },
      ],
      endReason: "idle_timeout",
    });
    expect(summary).toContain("2 user / 2 agent");
    expect(summary).toContain("idle_timeout");
    expect(summary).toContain("Hola, ¿cómo cambio el color del botón?");
    expect(summary).toContain("Usa la variante dark: del mismo selector.");
  });

  it("truncates very long messages", () => {
    const longContent = "x".repeat(2000);
    const summary = buildDeterministicChatSummary({
      messages: [
        { sender: "user", content: longContent, createdAt: "2026-04-29T10:00:00Z" },
        { sender: "agent", content: longContent, createdAt: "2026-04-29T10:00:05Z" },
      ],
      endReason: null,
    });
    // Ensures the helper enforces an upper bound on output size.
    expect(summary.length).toBeLessThan(1500);
    expect(summary).toContain("…");
  });
});

describeEmbeddedPostgres("chat resume + summary (db-backed)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-chat-resume-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(chatSessions);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const userId = `user-${randomUUID()}`;
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "ChatBot",
      role: "assistant",
      status: "running",
      adapterType: "claude_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    return { companyId, agentId, userId };
  }

  async function seedEndedSession(opts: {
    companyId: string;
    agentId: string;
    userId: string;
    summary?: string | null;
    endedAt?: Date;
    resumedFromSessionId?: string;
  }) {
    const sessionId = randomUUID();
    await db.insert(chatSessions).values({
      id: sessionId,
      agentId: opts.agentId,
      companyId: opts.companyId,
      startedByUserId: opts.userId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      endedAt: opts.endedAt ?? new Date(),
      endReason: "user_closed",
      summary: opts.summary ?? null,
      resumedFromSessionId: opts.resumedFromSessionId ?? null,
    });
    return sessionId;
  }

  it("setSessionSummary persists the summary (idempotent — last write wins)", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const sessionId = await seedEndedSession({ companyId, agentId, userId });
    const chat = chatService(db);

    expect(await chat.setSessionSummary(sessionId, "first summary")).toBe(true);
    expect(await chat.setSessionSummary(sessionId, "second summary")).toBe(true);
    // Empty / whitespace input is rejected.
    expect(await chat.setSessionSummary(sessionId, "  ")).toBe(false);

    const rows = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId));
    expect(rows[0]?.summary).toBe("second summary");
  });

  it("getResumeContext walks the resumed-from chain oldest → newest and concatenates summaries", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const a = await seedEndedSession({ companyId, agentId, userId, summary: "Sesión A: hablamos del logo" });
    const b = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Sesión B: refinamos colores",
      resumedFromSessionId: a,
    });
    const c = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Sesión C: ajustamos tipografía",
      resumedFromSessionId: b,
    });

    const ctx = await chatService(db).getResumeContext(c);
    expect(ctx.priorSessionIds).toEqual([a, b, c]);
    const aPos = ctx.combinedSummary.indexOf("Sesión A");
    const bPos = ctx.combinedSummary.indexOf("Sesión B");
    const cPos = ctx.combinedSummary.indexOf("Sesión C");
    expect(aPos).toBeGreaterThanOrEqual(0);
    expect(aPos).toBeLessThan(bPos);
    expect(bPos).toBeLessThan(cPos);
  });

  it("getResumeContext skips empty summaries but still returns the chain", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const a = await seedEndedSession({ companyId, agentId, userId, summary: null });
    const b = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Sesión B con contenido",
      resumedFromSessionId: a,
    });

    const ctx = await chatService(db).getResumeContext(b);
    expect(ctx.priorSessionIds).toEqual([a, b]);
    expect(ctx.combinedSummary).toContain("Sesión B con contenido");
    expect(ctx.combinedSummary).not.toContain("undefined");
  });

  it("getResumeContext only includes a fresh tail when prior session ended recently", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const stale = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Stale",
      endedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago, well past the 5m window
    });
    await db.insert(chatMessages).values({
      id: randomUUID(),
      sessionId: stale,
      agentId,
      sender: "user",
      content: "old message",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const staleCtx = await chatService(db).getResumeContext(stale);
    expect(staleCtx.lastMessages).toHaveLength(0);

    const fresh = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Fresh",
      endedAt: new Date(),
    });
    await db.insert(chatMessages).values({
      id: randomUUID(),
      sessionId: fresh,
      agentId,
      sender: "user",
      content: "fresh message",
      createdAt: new Date(),
    });

    const freshCtx = await chatService(db).getResumeContext(fresh);
    expect(freshCtx.lastMessages).toHaveLength(1);
    expect(freshCtx.lastMessages[0]?.content).toBe("fresh message");
  });

  it("resumeSession creates a new session row linked to the prior one and returns context", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const prior = await seedEndedSession({
      companyId,
      agentId,
      userId,
      summary: "Sesión previa: hablamos de migraciones",
    });

    const chat = chatService(db);
    const { session, resumeContext } = await chat.resumeSession({
      priorSessionId: prior,
      agentId,
      companyId,
      userId,
    });

    expect(session.resumedFromSessionId).toBe(prior);
    expect(resumeContext.priorSessionIds).toEqual([prior]);
    expect(resumeContext.combinedSummary).toContain("Sesión previa");

    const rows = await db.select().from(chatSessions).where(eq(chatSessions.id, session.id));
    expect(rows[0]?.resumedFromSessionId).toBe(prior);
    expect(rows[0]?.endedAt).toBeNull();

    // Cleanup so other tests start with no active session for this agent
    chat.endSession(agentId, "user_closed");
  });

  it("resumeSession refuses to resume a session belonging to a different user", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const otherUser = `user-${randomUUID()}`;
    const prior = await seedEndedSession({ companyId, agentId, userId, summary: "x" });

    await expect(
      chatService(db).resumeSession({
        priorSessionId: prior,
        agentId,
        companyId,
        userId: otherUser,
      }),
    ).rejects.toThrow("PRIOR_SESSION_NOT_OWNED_BY_USER");
  });

  it("resumeSession refuses when there is already an active session for the agent", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    const prior = await seedEndedSession({ companyId, agentId, userId, summary: "x" });
    const chat = chatService(db);

    // Start a fresh active session.
    chat.startSession({ agentId, companyId, userId });

    await expect(chat.resumeSession({ priorSessionId: prior, agentId, companyId, userId })).rejects.toThrow(
      "AGENT_HAS_ACTIVE_SESSION",
    );

    chat.endSession(agentId, "user_closed");
  });

  it("resumeSession refuses to resume a session that is still active", async () => {
    const { companyId, agentId, userId } = await seedAgent();
    // Insert a session row WITHOUT endedAt — represents an in-flight chat.
    const liveSessionId = randomUUID();
    await db.insert(chatSessions).values({
      id: liveSessionId,
      agentId,
      companyId,
      startedByUserId: userId,
      startedAt: new Date(),
      endedAt: null,
    });

    await expect(
      chatService(db).resumeSession({ priorSessionId: liveSessionId, agentId, companyId, userId }),
    ).rejects.toThrow("PRIOR_SESSION_STILL_ACTIVE");
  });
});
