/**
 * Agent direct chat service with database persistence.
 *
 * Manages chat sessions between board users and agents.
 * Active sessions are cached in memory for performance;
 * all sessions and messages are persisted to the database
 * for history browsing.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { chatSessions, chatMessages } from "@paperclipai/db";
import { eq, desc, asc, gt, sql } from "drizzle-orm";
import { publishLiveEvent } from "./live-events.js";

// ── Types ──────────────────────────────────────────────────────────

export interface ChatAttachment {
  assetId: string;
  contentPath: string;
  contentType: string;
  originalFilename: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  sender: "user" | "agent";
  content: string;
  attachments?: ChatAttachment[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  agentId: string;
  companyId: string;
  startedByUserId: string;
  startedAt: string;
  lastActivityAt: string;
  /** Messages in chronological order */
  messages: ChatMessage[];
  /** Timer handle for idle cleanup */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface ChatSessionSummary {
  id: string;
  agentId: string;
  companyId: string;
  startedByUserId: string;
  messageCount: number;
  startedAt: string;
  endedAt: string | null;
  firstMessagePreview: string | null;
}

// ── Constants ──────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── In-memory store ────────────────────────────────────────────────

/** agentId → active session */
const sessions = new Map<string, ChatSession>();

// ── Helpers ────────────────────────────────────────────────────────

function resetIdleTimer(session: ChatSession, onTimeout: () => void) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(onTimeout, IDLE_TIMEOUT_MS);
}

function now() {
  return new Date().toISOString();
}

// ── Service ────────────────────────────────────────────────────────

export function chatService(db?: Db) {
  /**
   * Start a new chat session for an agent.
   * Enforces one active session per agent.
   * Returns the existing session if one is already active.
   */
  function startSession(opts: {
    agentId: string;
    companyId: string;
    userId: string;
  }): ChatSession {
    const existing = sessions.get(opts.agentId);
    if (existing) return existing;

    const sessionId = randomUUID();
    const startedAt = now();

    const session: ChatSession = {
      id: sessionId,
      agentId: opts.agentId,
      companyId: opts.companyId,
      startedByUserId: opts.userId,
      startedAt,
      lastActivityAt: startedAt,
      messages: [],
      idleTimer: null,
    };

    sessions.set(opts.agentId, session);

    resetIdleTimer(session, () => endSession(opts.agentId));

    // Persist session to DB (async, non-blocking)
    if (db) {
      db.insert(chatSessions)
        .values({
          id: sessionId,
          agentId: opts.agentId,
          companyId: opts.companyId,
          startedByUserId: opts.userId,
          startedAt: new Date(startedAt),
        })
        .execute()
        .catch((err) => console.error("[chat] Failed to persist session:", err));
    }

    publishLiveEvent({
      companyId: opts.companyId,
      type: "chat.session.started" as any,
      payload: {
        sessionId: session.id,
        agentId: opts.agentId,
        startedByUserId: opts.userId,
      },
    });

    return session;
  }

  /**
   * End an active chat session for an agent.
   */
  function endSession(agentId: string): boolean {
    const session = sessions.get(agentId);
    if (!session) return false;

    if (session.idleTimer) clearTimeout(session.idleTimer);
    sessions.delete(agentId);

    // Persist session end to DB (async, non-blocking)
    if (db) {
      db.update(chatSessions)
        .set({
          endedAt: new Date(),
          messageCount: session.messages.length,
        })
        .where(eq(chatSessions.id, session.id))
        .execute()
        .catch((err) => console.error("[chat] Failed to persist session end:", err));
    }

    publishLiveEvent({
      companyId: session.companyId,
      type: "chat.session.ended" as any,
      payload: {
        sessionId: session.id,
        agentId,
        messageCount: session.messages.length,
      },
    });

    return true;
  }

  /**
   * Get the active session for an agent, if any.
   */
  function getSession(agentId: string): ChatSession | null {
    return sessions.get(agentId) ?? null;
  }

  /**
   * Send a message from a user to an agent.
   * Creates a session if one doesn't exist.
   */
  function sendMessage(opts: {
    agentId: string;
    companyId: string;
    userId: string;
    content: string;
    attachments?: ChatAttachment[];
  }): ChatMessage {
    let session = sessions.get(opts.agentId);
    if (!session) {
      session = startSession({
        agentId: opts.agentId,
        companyId: opts.companyId,
        userId: opts.userId,
      });
    }

    const msg: ChatMessage = {
      id: randomUUID(),
      sessionId: session.id,
      agentId: opts.agentId,
      sender: "user",
      content: opts.content,
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      createdAt: now(),
    };

    session.messages.push(msg);
    session.lastActivityAt = msg.createdAt;

    resetIdleTimer(session, () => endSession(opts.agentId));

    // Persist message to DB (async, non-blocking)
    if (db) {
      db.insert(chatMessages)
        .values({
          id: msg.id,
          sessionId: session.id,
          agentId: opts.agentId,
          sender: "user",
          content: opts.content,
          attachments: opts.attachments?.length ? opts.attachments : null,
          createdAt: new Date(msg.createdAt),
        })
        .execute()
        .then(() => {
          // Update message count
          return db.update(chatSessions)
            .set({ messageCount: session!.messages.length })
            .where(eq(chatSessions.id, session!.id))
            .execute();
        })
        .catch((err) => console.error("[chat] Failed to persist message:", err));
    }

    publishLiveEvent({
      companyId: opts.companyId,
      type: "chat.message.sent" as any,
      payload: {
        sessionId: session.id,
        messageId: msg.id,
        agentId: opts.agentId,
        sender: "user",
        ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
      },
    });

    return msg;
  }

  /**
   * Send a response from an agent back to the user.
   * Called by the agent process during a chat-mode run.
   */
  function sendResponse(opts: {
    agentId: string;
    content: string;
  }): ChatMessage | null {
    const session = sessions.get(opts.agentId);
    if (!session) return null;

    const msg: ChatMessage = {
      id: randomUUID(),
      sessionId: session.id,
      agentId: opts.agentId,
      sender: "agent",
      content: opts.content,
      createdAt: now(),
    };

    session.messages.push(msg);
    session.lastActivityAt = msg.createdAt;

    resetIdleTimer(session, () => endSession(opts.agentId));

    // Persist message to DB (async, non-blocking)
    if (db) {
      db.insert(chatMessages)
        .values({
          id: msg.id,
          sessionId: session.id,
          agentId: opts.agentId,
          sender: "agent",
          content: opts.content,
          attachments: null,
          createdAt: new Date(msg.createdAt),
        })
        .execute()
        .then(() => {
          return db.update(chatSessions)
            .set({ messageCount: session!.messages.length })
            .where(eq(chatSessions.id, session!.id))
            .execute();
        })
        .catch((err) => console.error("[chat] Failed to persist response:", err));
    }

    publishLiveEvent({
      companyId: session.companyId,
      type: "chat.message.received" as any,
      payload: {
        sessionId: session.id,
        messageId: msg.id,
        agentId: opts.agentId,
        sender: "agent",
        content: opts.content,
      },
    });

    return msg;
  }

  /**
   * Poll for messages since a given message ID.
   * Used by agent processes to pick up new user messages.
   */
  function getMessagesSince(agentId: string, afterMessageId?: string): ChatMessage[] {
    const session = sessions.get(agentId);
    if (!session) return [];

    if (!afterMessageId) return [...session.messages];

    const idx = session.messages.findIndex((m) => m.id === afterMessageId);
    if (idx === -1) return [...session.messages];

    return session.messages.slice(idx + 1);
  }

  /**
   * Get paginated list of past chat sessions for an agent.
   */
  async function getHistory(agentId: string, opts?: { limit?: number; before?: string }): Promise<ChatSessionSummary[]> {
    if (!db) return [];

    const limit = opts?.limit ?? 20;

    const rows = await db
      .select({
        id: chatSessions.id,
        agentId: chatSessions.agentId,
        companyId: chatSessions.companyId,
        startedByUserId: chatSessions.startedByUserId,
        messageCount: chatSessions.messageCount,
        startedAt: chatSessions.startedAt,
        endedAt: chatSessions.endedAt,
      })
      .from(chatSessions)
      .where(
        opts?.before
          ? sql`${chatSessions.agentId} = ${agentId} AND ${chatSessions.startedAt} < ${opts.before}`
          : eq(chatSessions.agentId, agentId),
      )
      .orderBy(desc(chatSessions.startedAt))
      .limit(limit);

    // Fetch first message preview for each session
    const summaries: ChatSessionSummary[] = [];
    for (const row of rows) {
      const firstMsg = await db
        .select({ content: chatMessages.content, sender: chatMessages.sender })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, row.id))
        .orderBy(asc(chatMessages.createdAt))
        .limit(1);

      summaries.push({
        id: row.id,
        agentId: row.agentId,
        companyId: row.companyId,
        startedByUserId: row.startedByUserId,
        messageCount: row.messageCount,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        firstMessagePreview: firstMsg[0]?.content.slice(0, 120) ?? null,
      });
    }

    return summaries;
  }

  /**
   * Get full message thread for a past chat session.
   */
  async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!db) return [];

    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      agentId: r.agentId,
      sender: r.sender as "user" | "agent",
      content: r.content,
      ...(r.attachments ? { attachments: r.attachments as ChatAttachment[] } : {}),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Get a specific past session by ID.
   */
  async function getSessionById(sessionId: string): Promise<{ id: string; agentId: string; companyId: string } | null> {
    if (!db) return null;

    const rows = await db
      .select({ id: chatSessions.id, agentId: chatSessions.agentId, companyId: chatSessions.companyId })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    return rows[0] ?? null;
  }

  return {
    startSession,
    endSession,
    getSession,
    sendMessage,
    sendResponse,
    getMessagesSince,
    getHistory,
    getSessionMessages,
    getSessionById,
  };
}
