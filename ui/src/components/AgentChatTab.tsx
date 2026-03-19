/**
 * AgentChatTab — Interactive chat UI for direct agent conversations.
 *
 * Ephemeral, session-level chat. No persistence across page refreshes.
 * Uses REST polling for message delivery and WebSocket live events
 * for real-time response streaming.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { Send, X, Loader2, MessageSquare, ChevronDown, ChevronRight, Paperclip, FileText, Download } from "lucide-react";
import type { Agent, AssetImage } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { type LiveRunForIssue } from "../api/heartbeats";
import { MarkdownBody } from "./MarkdownBody";
import { RunTranscriptView } from "./transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";

// ── Types ──────────────────────────────────────────────────────────

interface ChatAttachment {
  assetId: string;
  contentPath: string;
  contentType: string;
  originalFilename: string | null;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  sender: "user" | "agent";
  content: string;
  attachments?: ChatAttachment[];
  createdAt: string;
}

interface ChatSession {
  id: string;
  agentId: string;
  companyId: string;
  startedByUserId: string;
  startedAt: string;
  lastActivityAt: string;
  messages: ChatMessage[];
}

/** Pending attachment (uploaded but not yet sent with a message) */
interface PendingAttachment {
  assetId: string;
  contentPath: string;
  contentType: string;
  originalFilename: string | null;
  previewUrl?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

// ── Attachment chips (preview before sending) ─────────────────────

function PendingAttachmentChip({
  att,
  onRemove,
}: {
  att: PendingAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="relative group inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
      {isImageType(att.contentType) && att.previewUrl ? (
        <img
          src={att.previewUrl}
          alt={att.originalFilename ?? "attachment"}
          className="h-8 w-8 rounded object-cover"
        />
      ) : (
        <FileText className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="max-w-[120px] truncate text-muted-foreground">
        {att.originalFilename ?? "file"}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Inline attachment rendering (in message bubbles) ──────────────

function MessageAttachments({ attachments, isUser }: { attachments: ChatAttachment[]; isUser: boolean }) {
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {attachments.map((att) =>
        isImageType(att.contentType) ? (
          <a
            key={att.assetId}
            href={att.contentPath}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={att.contentPath}
              alt={att.originalFilename ?? "image"}
              className="max-h-48 max-w-full rounded border border-border/50 object-contain"
            />
          </a>
        ) : (
          <a
            key={att.assetId}
            href={att.contentPath}
            download={att.originalFilename ?? undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
              isUser
                ? "border-primary-foreground/30 text-primary-foreground/80 hover:bg-primary-foreground/10"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <Download className="h-3 w-3" />
            <span className="max-w-[140px] truncate">{att.originalFilename ?? "file"}</span>
          </a>
        ),
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function AgentChatTab({ agent, companyId }: { agent: Agent; companyId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [activeRun, setActiveRun] = useState<LiveRunForIssue | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track the agent's active chat process while typing
  useEffect(() => {
    if (!isTyping) {
      setActiveRun(null);
      return;
    }

    let cancelled = false;

    const pollChatProcess = async () => {
      try {
        const proc = await agentsApi.chatProcess(agent.id, companyId);
        if (cancelled) return;
        if (proc && proc.status === "running") {
          setActiveRun({
            id: proc.id,
            status: "running",
            invocationSource: "on_demand",
            triggerDetail: null,
            startedAt: proc.startedAt,
            finishedAt: null,
            createdAt: proc.startedAt,
            agentId: agent.id,
            agentName: agent.name,
            adapterType: agent.adapterType,
          });
        }
      } catch {
        // Ignore errors
      }
    };

    void pollChatProcess();
    const interval = setInterval(pollChatProcess, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isTyping, companyId, agent.id, agent.name]);

  // Reset thinking accordion to open when a new typing session starts
  useEffect(() => {
    if (isTyping) setThinkingOpen(true);
  }, [isTyping]);

  const runs = useMemo(() => (activeRun ? [activeRun] : []), [activeRun]);
  const { transcriptByRun } = useLiveRunTranscripts({ runs, companyId, maxChunksPerRun: 120 });
  const transcript = activeRun ? (transcriptByRun.get(activeRun.id) ?? []) : [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper: add a message if not already present
  const addMessageIfNew = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    lastMessageIdRef.current = msg.id;
    if (msg.sender === "agent") {
      setIsTyping(false);
    }
  }, []);

  // Primary: WebSocket for real-time chat messages
  useEffect(() => {
    if (!sessionId || !companyId) return;

    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as { type: string; companyId: string; payload?: Record<string, unknown> };
          if (parsed.companyId !== companyId) return;

          const payload = parsed.payload ?? {};
          const eventAgentId = payload.agentId as string | undefined;
          if (eventAgentId !== agent.id) return;

          if (parsed.type === "chat.message.sent" || parsed.type === "chat.message.received") {
            const msgId = payload.messageId as string;
            const sender = payload.sender as "user" | "agent";
            const content = payload.content as string | undefined;

            // For received messages (agent responses), content is in the payload
            // For sent messages (user), we already have it locally
            if (msgId && sender === "agent" && content) {
              addMessageIfNew({
                id: msgId,
                sessionId: payload.sessionId as string ?? sessionId,
                agentId: agent.id,
                sender,
                content,
                createdAt: new Date().toISOString(),
              });
            }
          }

          if (parsed.type === "chat.session.ended") {
            setSessionId(null);
            setMessages([]);
            setIsTyping(false);
            lastMessageIdRef.current = null;
          }
        } catch {
          // Ignore parse errors
        }
      };

      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "chat_tab_unmount");
      }
    };
  }, [sessionId, companyId, agent.id, addMessageIfNew]);

  // Fallback: slow REST polling to catch any missed messages
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const result = await agentsApi.chatMessages(agent.id, lastMessageIdRef.current ?? undefined, companyId);
        const newMessages = (result as { messages: ChatMessage[] }).messages;
        for (const msg of newMessages) {
          addMessageIfNew(msg);
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    pollIntervalRef.current = setInterval(poll, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [sessionId, agent.id, companyId, addMessageIfNew]);

  // ── File upload helper ────────────────────────────────────────────

  const uploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setUploadingCount((c) => c + 1);
        try {
          const asset: AssetImage = await assetsApi.uploadImage(companyId, file, "chat");
          const pending: PendingAttachment = {
            assetId: asset.assetId,
            contentPath: asset.contentPath,
            contentType: asset.contentType,
            originalFilename: asset.originalFilename,
          };
          // Create a local preview URL for images
          if (isImageType(file.type)) {
            pending.previewUrl = URL.createObjectURL(file);
          }
          setPendingAttachments((prev) => [...prev, pending]);
        } catch {
          // Silently skip failed uploads
        } finally {
          setUploadingCount((c) => c - 1);
        }
      }
      inputRef.current?.focus();
    },
    [companyId],
  );

  // ── Clipboard paste handler ───────────────────────────────────────

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        void uploadFiles(files);
      }
    },
    [uploadFiles],
  );

  // ── File input change handler ─────────────────────────────────────

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        void uploadFiles(Array.from(files));
      }
      // Reset so re-selecting the same file triggers onChange again
      e.target.value = "";
    },
    [uploadFiles],
  );

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const att of pendingAttachments) {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async ({ content, attachments }: { content: string; attachments: PendingAttachment[] }) => {
      const attachmentIds = attachments.length > 0 ? attachments.map((a) => a.assetId) : undefined;
      const msg = await agentsApi.sendChatMessage(agent.id, content, companyId, attachmentIds);
      return { msg: msg as ChatMessage, attachments };
    },
    onSuccess: ({ msg, attachments }) => {
      // Attach the pending attachments to the local message for immediate rendering
      const enrichedMsg: ChatMessage = {
        ...msg,
        attachments: attachments.length > 0
          ? attachments.map((a) => ({
              assetId: a.assetId,
              contentPath: a.contentPath,
              contentType: a.contentType,
              originalFilename: a.originalFilename,
            }))
          : undefined,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === enrichedMsg.id)) return prev;
        return [...prev, enrichedMsg];
      });
      lastMessageIdRef.current = enrichedMsg.id;
      if (!sessionId) {
        setSessionId(enrichedMsg.sessionId);
      }
      setIsTyping(true);
      setInput("");
      // Revoke preview URLs
      for (const att of attachments) {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      }
      setPendingAttachments([]);
      inputRef.current?.focus();
    },
  });

  // End session
  const endMutation = useMutation({
    mutationFn: () => agentsApi.endChatSession(agent.id, companyId),
    onSuccess: () => {
      setSessionId(null);
      setMessages([]);
      setIsTyping(false);
      lastMessageIdRef.current = null;
      setPendingAttachments([]);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || sendMutation.isPending) return;
    sendMutation.mutate({ content: trimmed || "(attachment)", attachments: [...pendingAttachments] });
  }, [input, pendingAttachments, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const removePendingAttachment = useCallback((idx: number) => {
    setPendingAttachments((prev) => {
      const removed = prev[idx];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>
            {sessionId ? "Chat session active" : "Start a conversation"}
          </span>
        </div>
        {sessionId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => endMutation.mutate()}
            disabled={endMutation.isPending}
            className="text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            End session
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && !sessionId && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <MessageSquare className="h-8 w-8 mb-3 opacity-40" />
            <p>Send a message to start chatting with {agent.name}.</p>
            <p className="text-xs mt-1 opacity-70">
              The session is ephemeral — messages are not persisted.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.sender === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {msg.sender === "agent" ? (
                <MarkdownBody className="text-sm">{msg.content}</MarkdownBody>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              )}
              {msg.attachments && msg.attachments.length > 0 && (
                <MessageAttachments attachments={msg.attachments} isUser={msg.sender === "user"} />
              )}
              <span className="block text-[10px] opacity-50 mt-1">
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-muted rounded-lg text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => setThinkingOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-2 w-full text-left hover:bg-muted/80 rounded-lg transition-colors"
              >
                <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                <span className="flex-1">{agent.name} is thinking...</span>
                {transcript.length > 0 && (
                  thinkingOpen
                    ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 flex-shrink-0" />
                )}
              </button>
              {thinkingOpen && transcript.length > 0 && (
                <div className="px-3 pb-2 max-h-[300px] overflow-y-auto border-t border-border/50">
                  <RunTranscriptView
                    entries={transcript}
                    density="compact"
                    streaming
                    collapseStdout
                    thinkingClassName="!text-[10px] !leading-4"
                    emptyMessage=""
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-3">
        {/* Pending attachment previews */}
        {(pendingAttachments.length > 0 || uploadingCount > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingAttachments.map((att, idx) => (
              <PendingAttachmentChip
                key={att.assetId}
                att={att}
                onRemove={() => removePendingAttachment(idx)}
              />
            ))}
            {uploadingCount > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading...
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          {/* Attach button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-[38px] px-2 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Message ${agent.name}...`}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "min-h-[38px] max-h-[120px]",
            )}
            style={{ height: "auto" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={(!input.trim() && pendingAttachments.length === 0) || sendMutation.isPending}
            className="h-[38px] px-3"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sendMutation.isError && (
          <p className="text-xs text-destructive mt-1">
            Failed to send message. Try again.
          </p>
        )}
      </div>
    </div>
  );
}
