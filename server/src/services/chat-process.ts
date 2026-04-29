/**
 * Chat Process Manager — spawns independent Claude Code processes for chat sessions.
 *
 * Unlike heartbeat runs, chat processes do NOT occupy the agent's run slot.
 * They run in parallel with the heartbeat queue, allowing agents to chat
 * and work on tasks simultaneously.
 */

import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import {
  buildPaperclipEnv,
  ensurePathInEnv,
  asString,
  asBoolean,
  asNumber,
  asStringArray,
  parseObject,
  joinPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import { publishLiveEvent } from "./live-events.js";
import type { ChatResumeContext, ChatMessage } from "./chat.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

// ── Types ──────────────────────────────────────────────────────────

export interface ChatProcess {
  id: string;
  agentId: string;
  companyId: string;
  sessionId: string;
  pid: number | null;
  startedAt: string;
  status: "running" | "exited";
  exitCode: number | null;
}

interface AgentInfo {
  id: string;
  companyId: string;
  name: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
}

// ── In-memory store ────────────────────────────────────────────────

/** agentId → running chat process */
const chatProcesses = new Map<string, { meta: ChatProcess; child: ChildProcess }>();

// ── Skills directory ───────────────────────────────────────────────

const PAPERCLIP_SKILLS_CANDIDATES = [
  path.resolve(__moduleDir, "../../node_modules/@paperclipai/adapter-claude-local/dist/skills"),
  path.resolve(__moduleDir, "../../../skills"),
  path.resolve(__moduleDir, "../../../../skills"),
];

async function resolvePaperclipSkillsDir(): Promise<string | null> {
  for (const candidate of PAPERCLIP_SKILLS_CANDIDATES) {
    const isDir = await fs
      .stat(candidate)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (isDir) return candidate;
  }
  return null;
}

async function buildSkillsDir(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-chat-skills-"));
  const target = path.join(tmp, ".claude", "skills");
  await fs.mkdir(target, { recursive: true });
  const skillsDir = await resolvePaperclipSkillsDir();
  if (!skillsDir) return tmp;
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await fs.symlink(path.join(skillsDir, entry.name), path.join(target, entry.name));
    }
  }
  return tmp;
}

// ── Summary fallback ───────────────────────────────────────────────

/**
 * Deterministic summary builder used when the agent process exits without
 * writing its own summary (rare: typically only happens when the user closes
 * the chat mid-response or the process crashes).
 *
 * Cheaper than spawning another LLM call and gives a usable scaffold so a
 * resumed conversation still has *some* anchor. The agent will replace this
 * on its next exit if it gets the chance.
 */
const DETERMINISTIC_SUMMARY_PREVIEW_CHARS = 280;
const DETERMINISTIC_SUMMARY_MAX_CHARS = 1200;

export function buildDeterministicChatSummary(input: {
  messages: { sender: "user" | "agent"; content: string; createdAt: string }[];
  endReason: string | null;
}): string {
  const { messages, endReason } = input;
  if (messages.length === 0) return "";

  const userMessages = messages.filter((m) => m.sender === "user");
  const agentMessages = messages.filter((m) => m.sender === "agent");

  const firstUser = userMessages[0]?.content.trim() ?? "";
  const lastUser = userMessages[userMessages.length - 1]?.content.trim() ?? "";
  const lastAgent = agentMessages[agentMessages.length - 1]?.content.trim() ?? "";

  const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

  const lines: string[] = [];
  lines.push(
    `Auto-generated fallback summary (${userMessages.length} user / ${agentMessages.length} agent messages, ended: ${endReason ?? "unknown"}).`,
  );
  if (firstUser) {
    lines.push("", `First user message: ${truncate(firstUser, DETERMINISTIC_SUMMARY_PREVIEW_CHARS)}`);
  }
  if (lastUser && lastUser !== firstUser) {
    lines.push(`Last user message: ${truncate(lastUser, DETERMINISTIC_SUMMARY_PREVIEW_CHARS)}`);
  }
  if (lastAgent) {
    lines.push(`Last agent reply: ${truncate(lastAgent, DETERMINISTIC_SUMMARY_PREVIEW_CHARS)}`);
  }

  return truncate(lines.join("\n"), DETERMINISTIC_SUMMARY_MAX_CHARS);
}

// ── Prompt helpers ─────────────────────────────────────────────────

const RESUME_TAIL_CONTENT_MAX_CHARS = 600;

function truncateForPrompt(content: string, max: number): string {
  if (content.length <= max) return content;
  return `${content.slice(0, max).trimEnd()}…`;
}

function buildResumeContextSection(ctx: ChatResumeContext | undefined): string | null {
  if (!ctx) return null;
  if (ctx.priorSessionIds.length === 0 && ctx.lastMessages.length === 0) return null;

  const lines: string[] = ["## Prior conversation context", ""];

  if (ctx.combinedSummary && ctx.combinedSummary.trim().length > 0) {
    lines.push(
      "This session is a continuation of an earlier conversation with the same user.",
      "Use this summary to maintain continuity:",
      "",
      ctx.combinedSummary.trim(),
      "",
    );
  } else {
    lines.push(
      "This session is a continuation of an earlier conversation with the same user.",
      "(No prior summary was recorded.)",
      "",
    );
  }

  if (ctx.lastMessages.length > 0) {
    lines.push("Most recent exchange from the prior session (verbatim, oldest first):", "");
    for (const m of ctx.lastMessages) {
      const who = m.sender === "agent" ? "Agent" : "User";
      lines.push(`- **${who}**: ${truncateForPrompt(m.content, RESUME_TAIL_CONTENT_MAX_CHARS)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Service ────────────────────────────────────────────────────────

export function chatProcessService() {
  /**
   * Spawn a chat process for an agent, independent of the heartbeat queue.
   * Returns the chat process metadata, or the existing one if already running.
   */
  async function spawnChatProcess(opts: {
    agent: AgentInfo;
    sessionId: string;
    initialMessage?: string;
    /**
     * When the session was started via resume, the assembled context from prior
     * sessions: combined summaries plus an optional tail of recent messages.
     */
    resumeContext?: ChatResumeContext;
  }): Promise<ChatProcess> {
    const existing = chatProcesses.get(opts.agent.id);
    if (existing && existing.meta.status === "running") {
      return existing.meta;
    }

    const chatId = randomUUID();
    const config = parseObject(opts.agent.adapterConfig);
    const command = asString(config.command, "claude");
    const cwd = asString(config.cwd, process.cwd());
    const model = asString(config.model, "");
    const maxTurns = asNumber(config.maxTurnsPerRun, 0);
    const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, false);
    const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
    const extraArgs = (() => {
      const fromExtraArgs = asStringArray(config.extraArgs);
      if (fromExtraArgs.length > 0) return fromExtraArgs;
      return asStringArray(config.args);
    })();

    // Build environment
    const env: Record<string, string> = { ...buildPaperclipEnv(opts.agent) };
    env.PAPERCLIP_RUN_ID = chatId;
    env.PAPERCLIP_WAKE_REASON = "chat";

    // Create auth token
    const authToken = createLocalAgentJwt(opts.agent.id, opts.agent.companyId, opts.agent.adapterType, chatId);
    if (authToken) {
      env.PAPERCLIP_API_KEY = authToken;
    }

    const effectiveEnv = ensurePathInEnv({ ...process.env, ...env }) as Record<string, string>;

    // Strip nesting-guard vars
    for (const key of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SESSION", "CLAUDE_CODE_PARENT_SESSION"]) {
      delete effectiveEnv[key];
    }

    // Build skills dir
    const skillsDir = await buildSkillsDir();

    // Handle instructions file — combine with path directive if configured
    let effectiveInstructionsFilePath = instructionsFilePath;
    if (instructionsFilePath) {
      try {
        const instructionsContent = await fs.readFile(instructionsFilePath, "utf-8");
        const instructionsFileDir = `${path.dirname(instructionsFilePath)}/`;
        const pathDirective = `\nThe above agent instructions were loaded from ${instructionsFilePath}. Resolve any relative file references from ${instructionsFileDir}.`;
        const combinedPath = path.join(skillsDir, "agent-instructions.md");
        await fs.writeFile(combinedPath, instructionsContent + pathDirective, "utf-8");
        effectiveInstructionsFilePath = combinedPath;
      } catch {
        // If instructions file not found, proceed without it
        effectiveInstructionsFilePath = "";
      }
    }

    // Build CLI args — use chat-specific prompt instead of heartbeat template
    const promptSections: string[] = [];

    // Resume context (prior summaries + optional fresh tail) goes first so it
    // anchors the conversation that follows.
    const resumeBlock = buildResumeContextSection(opts.resumeContext);
    if (resumeBlock) promptSections.push(resumeBlock);

    const initialMessage = opts.initialMessage ?? "";
    const initialMessageBlock = initialMessage
      ? [`The user's message:`, `> ${initialMessage.replace(/\n/g, "\n> ")}`].join("\n")
      : `The user has just resumed this conversation. Greet them briefly, acknowledge what was discussed before (using the prior context above), and wait for their next message.`;

    const chatPrompt = [
      `You are agent ${opts.agent.id} (${opts.agent.name}).`,
      ``,
      `You are in CHAT MODE — a board user has opened a direct conversation with you.`,
      `Do NOT run any heartbeat procedure. Do NOT check assignments or work on issues.`,
      ``,
      `## Chat session: ${opts.sessionId}`,
      ``,
      initialMessageBlock,
      ``,
      `## How to respond`,
      ``,
      `1. Process the user's message. Use your tools freely (search code, read files, create issues, etc).`,
      `2. Send your response via the Paperclip API (use the paperclip skill if available, or curl):`,
      `   POST $PAPERCLIP_API_URL/api/agents/${opts.agent.id}/chat-response`,
      `   Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: ${chatId}`,
      `   Body: { "content": "Your response in markdown" }`,
      `3. After responding, poll for follow-up messages:`,
      `   GET $PAPERCLIP_API_URL/api/agents/${opts.agent.id}/chat-messages?after={lastMessageId}`,
      `   Poll every ~2 seconds. If no new messages for 60 seconds, check if the session still exists`,
      `   via GET $PAPERCLIP_API_URL/api/agents/${opts.agent.id}/chat-session — if gone, exit cleanly.`,
      `4. Repeat for each new user message.`,
      ``,
      `Stay conversational and concise. One response per user message.`,
      ``,
      `## Before exiting (REQUIRED)`,
      ``,
      `Right before you terminate (idle, user closed, or you are done), POST a 3-5 sentence`,
      `summary of this conversation so it can be used as context if the user resumes later:`,
      `  POST $PAPERCLIP_API_URL/api/agents/${opts.agent.id}/chat-summary`,
      `  Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: ${chatId}`,
      `  Body: { "summary": "..." , "sessionId": "${opts.sessionId}" }`,
      `Keep the summary user-facing and factual: what the user asked, what you did, any decisions.`,
    ].join("\n");
    promptSections.push(chatPrompt);
    const prompt = joinPromptSections(promptSections);

    const args = ["--print", "-", "--output-format", "stream-json", "--verbose"];
    if (dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    if (model) args.push("--model", model);
    if (maxTurns > 0) args.push("--max-turns", String(maxTurns));
    if (effectiveInstructionsFilePath) {
      args.push("--append-system-prompt-file", effectiveInstructionsFilePath);
    }
    args.push("--add-dir", skillsDir);
    if (extraArgs.length > 0) args.push(...extraArgs);

    // Spawn the process
    const child = spawn(command, args, {
      cwd,
      env: effectiveEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (child.stdin && prompt) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    const meta: ChatProcess = {
      id: chatId,
      agentId: opts.agent.id,
      companyId: opts.agent.companyId,
      sessionId: opts.sessionId,
      pid: child.pid ?? null,
      startedAt: new Date().toISOString(),
      status: "running",
      exitCode: null,
    };

    chatProcesses.set(opts.agent.id, { meta, child });

    // Stream stdout/stderr as live events for the UI
    const streamToLiveEvents = (stream: "stdout" | "stderr", data: Buffer) => {
      const chunk = data.toString("utf-8");
      publishLiveEvent({
        companyId: opts.agent.companyId,
        type: "heartbeat.run.log" as any,
        payload: {
          runId: chatId,
          agentId: opts.agent.id,
          stream,
          chunk,
          ts: new Date().toISOString(),
        },
      });
    };

    child.stdout?.on("data", (data: Buffer) => streamToLiveEvents("stdout", data));
    child.stderr?.on("data", (data: Buffer) => streamToLiveEvents("stderr", data));

    child.on("exit", (code) => {
      meta.status = "exited";
      meta.exitCode = code;
      chatProcesses.delete(opts.agent.id);

      publishLiveEvent({
        companyId: opts.agent.companyId,
        type: "heartbeat.run.status" as any,
        payload: {
          runId: chatId,
          agentId: opts.agent.id,
          status: code === 0 ? "succeeded" : "failed",
          finishedAt: new Date().toISOString(),
        },
      });

      // Clean up skills dir
      fs.rm(skillsDir, { recursive: true, force: true }).catch(() => {});
    });

    publishLiveEvent({
      companyId: opts.agent.companyId,
      type: "heartbeat.run.status" as any,
      payload: {
        runId: chatId,
        agentId: opts.agent.id,
        status: "running",
      },
    });

    return meta;
  }

  /**
   * Get the active chat process for an agent.
   */
  function getProcess(agentId: string): ChatProcess | null {
    const entry = chatProcesses.get(agentId);
    if (!entry || entry.meta.status !== "running") return null;
    return entry.meta;
  }

  /**
   * Kill the chat process for an agent.
   */
  function killProcess(agentId: string): boolean {
    const entry = chatProcesses.get(agentId);
    if (!entry) return false;
    try {
      entry.child.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }
    chatProcesses.delete(agentId);
    return true;
  }

  return {
    spawnChatProcess,
    getProcess,
    killProcess,
  };
}
