/**
 * In-memory agent direct chat service.
 *
 * Manages ephemeral chat sessions between board users and agents.
 * No database persistence — sessions live only in memory and are
 * cleaned up on idle timeout or server restart.
 */

import { randomUUID } from "node:crypto";
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

export function chatService() {
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

    const session: ChatSession = {
      id: randomUUID(),
      agentId: opts.agentId,
      companyId: opts.companyId,
      startedByUserId: opts.userId,
      startedAt: now(),
      lastActivityAt: now(),
      messages: [],
      idleTimer: null,
    };

    sessions.set(opts.agentId, session);

    resetIdleTimer(session, () => endSession(opts.agentId));

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

  return {
    startSession,
    endSession,
    getSession,
    sendMessage,
    sendResponse,
    getMessagesSince,
  };
}
