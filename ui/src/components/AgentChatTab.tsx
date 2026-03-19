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
import { Send, X, Loader2, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { type LiveRunForIssue } from "../api/heartbeats";
import { MarkdownBody } from "./MarkdownBody";
import { RunTranscriptView } from "./transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";

// ── Types ──────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  sender: "user" | "agent";
  content: string;
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

// ── Component ──────────────────────────────────────────────────────

export function AgentChatTab({ agent, companyId }: { agent: Agent; companyId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [activeRun, setActiveRun] = useState<LiveRunForIssue | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Poll for new messages when session is active
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const result = await agentsApi.chatMessages(agent.id, lastMessageIdRef.current ?? undefined, companyId);
        const newMessages = (result as { messages: ChatMessage[] }).messages;
        if (newMessages.length > 0) {
          // Only add messages we don't already have
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = newMessages.filter((m: ChatMessage) => !existingIds.has(m.id));
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
          lastMessageIdRef.current = newMessages[newMessages.length - 1]!.id;

          // Update typing indicator based on last message sender
          const lastMsg = newMessages[newMessages.length - 1]!;
          if (lastMsg.sender === "agent") {
            setIsTyping(false);
          }
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    pollIntervalRef.current = setInterval(poll, 500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [sessionId, agent.id, companyId]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const msg = await agentsApi.sendChatMessage(agent.id, content, companyId);
      return msg as ChatMessage;
    },
    onSuccess: (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      lastMessageIdRef.current = msg.id;
      if (!sessionId) {
        setSessionId(msg.sessionId);
      }
      setIsTyping(true);
      setInput("");
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
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }, [input, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

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
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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
            disabled={!input.trim() || sendMutation.isPending}
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
