import { useState, useEffect, useRef, createElement } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AgentIcon } from "../AgentIconPicker";
import { MarkdownBody } from "../MarkdownBody";
import { cn } from "../../lib/utils";
import {
  describeToolInput,
  displayToolName,
  formatToolPayload,
  isCommandTool,
  parseToolPayload,
  summarizeToolInput,
  summarizeToolResult,
} from "../../lib/transcriptPresentation";
import {
  buildAssistantPartsFromTranscript,
  formatDurationWords,
  type IssueChatTranscriptEntry,
} from "../../lib/issue-chat-messages";
import type { TranscriptEntry } from "../../adapters";
import { Brain, Check, ChevronDown, Copy, Hammer, Loader2 } from "lucide-react";

type BuildPartsReturn = ReturnType<typeof buildAssistantPartsFromTranscript>;
type AssistantPart = BuildPartsReturn["parts"][number];
type LocalToolCallPart = Extract<AssistantPart, { type: "tool-call" }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getToolIcon(_toolName: string): React.ComponentType<{ className?: string }> {
  return Hammer;
}

function cleanToolDisplayText(tool: LocalToolCallPart): string {
  const name = displayToolName(tool.toolName, tool.args);
  if (isCommandTool(tool.toolName, tool.args)) return name;
  const summary = tool.result === undefined ? summarizeToolInput(tool.toolName, tool.args) : null;
  return summary ? `${name} ${summary}` : name;
}

function toolCountSummary(toolParts: LocalToolCallPart[]): string | null {
  if (toolParts.length === 0) return null;
  let commands = 0;
  let other = 0;
  for (const tool of toolParts) {
    if (isCommandTool(tool.toolName, tool.args)) commands++;
    else other++;
  }
  const parts: string[] = [];
  if (commands > 0) parts.push(`ran ${commands} command${commands === 1 ? "" : "s"}`);
  if (other > 0) parts.push(`called ${other} tool${other === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function useLiveElapsed(startMs: number | null | undefined, active: boolean): string | null {
  const [elapsed, setElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !startMs) return;
    const interval = setInterval(() => setElapsed(formatDurationWords(Date.now() - startMs)), 1000);
    return () => clearInterval(interval);
  }, [active, startMs]);
  if (!active || !startMs) return null;
  return elapsed;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyablePreBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/pre relative">
      <pre className={className}>{children}</pre>
      <button
        type="button"
        className={cn(
          "absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity hover:text-foreground group-hover/pre:opacity-100",
          copied && "opacity-100",
        )}
        title="Copy"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(children).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

function AgentReasoningPart({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const lastLine = lines[lines.length - 1] ?? text.slice(-200);
  const prevRef = useRef(lastLine);
  const [ticker, setTicker] = useState<{
    key: number;
    current: string;
    exiting: string | null;
  }>({ key: 0, current: lastLine, exiting: null });

  useEffect(() => {
    if (lastLine !== prevRef.current) {
      const prev = prevRef.current;
      prevRef.current = lastLine;
      setTicker((t) => ({ key: t.key + 1, current: lastLine, exiting: prev }));
    }
  }, [lastLine]);

  return (
    <div className="flex gap-2 px-1">
      <div className="flex flex-col items-center pt-0.5">
        <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      </div>
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
        {ticker.exiting !== null && (
          <span
            key={`out-${ticker.key}`}
            className="cot-line-exit absolute inset-x-0 truncate text-[13px] italic leading-5 text-muted-foreground/70"
            onAnimationEnd={() => setTicker((t) => ({ ...t, exiting: null }))}
          >
            {ticker.exiting}
          </span>
        )}
        <span
          key={`in-${ticker.key}`}
          className={cn(
            "absolute inset-x-0 truncate text-[13px] italic leading-5 text-muted-foreground/70",
            ticker.key > 0 && "cot-line-enter",
          )}
        >
          {ticker.current}
        </span>
      </div>
    </div>
  );
}

function AgentRollingToolPart({ toolParts }: { toolParts: LocalToolCallPart[] }) {
  const latest = toolParts[toolParts.length - 1] ?? null;
  const initialText = latest ? cleanToolDisplayText(latest) : "";
  const prevRef = useRef(initialText);
  const [ticker, setTicker] = useState<{
    key: number;
    current: string;
    exiting: string | null;
  }>({ key: 0, current: initialText, exiting: null });

  useEffect(() => {
    if (!latest) return;
    const fullText = cleanToolDisplayText(latest);
    if (fullText !== prevRef.current) {
      const prev = prevRef.current;
      prevRef.current = fullText;
      setTicker((t) => ({ key: t.key + 1, current: fullText, exiting: prev }));
    }
  }, [latest]);

  if (!latest) return null;

  const isRunning = latest.result === undefined;

  return (
    <div className="flex gap-2 px-1">
      <div className="flex flex-col items-center pt-0.5">
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/50" />
        ) : (
          createElement(getToolIcon(latest.toolName), {
            className: "h-3.5 w-3.5 shrink-0 text-muted-foreground/50",
          })
        )}
      </div>
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
        {ticker.exiting !== null && (
          <span
            key={`out-${ticker.key}`}
            className="cot-line-exit absolute inset-x-0 truncate text-[13px] leading-5 text-muted-foreground/70"
            onAnimationEnd={() => setTicker((t) => ({ ...t, exiting: null }))}
          >
            {ticker.exiting}
          </span>
        )}
        <span
          key={`in-${ticker.key}`}
          className={cn(
            "absolute inset-x-0 truncate text-[13px] leading-5 text-muted-foreground/70",
            ticker.key > 0 && "cot-line-enter",
          )}
        >
          {ticker.current}
        </span>
      </div>
    </div>
  );
}

function AgentToolPart({
  toolName,
  args,
  argsText,
  result,
}: {
  toolName: string;
  args?: unknown;
  argsText?: string;
  result?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const rawArgsText = argsText ?? "";
  const parsedArgs = args ?? parseToolPayload(rawArgsText);
  const resultText = typeof result === "string" ? result : result === undefined ? "" : formatToolPayload(result);
  const inputDetails = describeToolInput(toolName, parsedArgs);
  const displayName = displayToolName(toolName, parsedArgs);
  const isCommand = isCommandTool(toolName, parsedArgs);
  const summary = isCommand
    ? null
    : result === undefined
      ? summarizeToolInput(toolName, parsedArgs)
      : summarizeToolResult(resultText, false);
  const intentDetail = inputDetails.find((d) => d.label === "Intent");
  const title = intentDetail?.value ?? displayName;
  const nonIntentDetails = inputDetails.filter((d) => d.label !== "Intent");

  return (
    <div className="flex gap-2 px-1">
      <div className="flex flex-col items-center pt-1">
        {createElement(getToolIcon(toolName), { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground/50" })}
        {open ? <div className="mt-1 w-px flex-1 bg-border/40" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-accent/5"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground/80">
            {title}
            {!intentDetail && summary ? <span className="ml-1.5 text-muted-foreground/50">{summary}</span> : null}
          </span>
          {result === undefined ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/50" /> : null}
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform", open && "rotate-180")}
          />
        </button>

        {open ? (
          <div className="mt-1 space-y-2 pb-1">
            {nonIntentDetails.length > 0 ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  Input
                </div>
                <dl className="space-y-1.5">
                  {nonIntentDetails.map((detail) => (
                    <div key={`${detail.label}:${detail.value}`}>
                      <dt className="text-[10px] font-medium text-muted-foreground/60">{detail.label}</dt>
                      <dd
                        className={cn(
                          "text-xs leading-5 text-foreground/70",
                          detail.tone === "code" && "font-mono text-[11px]",
                        )}
                      >
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : rawArgsText ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  Input
                </div>
                <CopyablePreBlock className="overflow-x-auto rounded-md bg-accent/30 p-2 text-[11px] leading-4 text-foreground/70">
                  {rawArgsText}
                </CopyablePreBlock>
              </div>
            ) : null}
            {result !== undefined ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  Result
                </div>
                <CopyablePreBlock className="overflow-x-auto rounded-md bg-accent/30 p-2 text-[11px] leading-4 text-foreground/70">
                  {resultText}
                </CopyablePreBlock>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AgentChainOfThought({
  transcript,
  isActive,
  startedAt,
}: {
  transcript: TranscriptEntry[];
  isActive: boolean;
  startedAt?: number | null;
}) {
  const { parts } = buildAssistantPartsFromTranscript(transcript as IssueChatTranscriptEntry[]);

  const allReasoningText = parts
    .filter((p): p is Extract<AssistantPart, { type: "reasoning" }> => p.type === "reasoning")
    .map((p) => p.text ?? "")
    .join("\n");
  const toolParts = parts.filter((p): p is LocalToolCallPart => p.type === "tool-call");

  const hasActiveTool = toolParts.some((t) => t.result === undefined);
  const isReallyActive = isActive && hasActiveTool;
  const [expanded, setExpanded] = useState(isReallyActive);

  const liveElapsed = useLiveElapsed(startedAt, isActive);

  useEffect(() => {
    if (isReallyActive) setExpanded(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [isReallyActive]);

  let headerVerb: string;
  let headerSuffix: string | null = null;
  if (isActive) {
    headerVerb = "Working";
    if (liveElapsed) headerSuffix = `for ${liveElapsed}`;
  } else {
    headerVerb = "Worked";
  }

  const summary = toolCountSummary(toolParts);
  const hasContent = allReasoningText.trim().length > 0 || toolParts.length > 0;

  return (
    <div>
      <button
        type="button"
        className="group flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left transition-colors hover:bg-accent/5"
        onClick={() => hasContent && setExpanded((v) => !v)}
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
          {isActive ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
            </span>
          )}
          {isActive ? <span className="shimmer-text">{headerVerb}</span> : headerVerb}
        </span>
        {headerSuffix ? <span className="text-xs text-muted-foreground/60">{headerSuffix}</span> : null}
        {summary ? <span className="text-xs text-muted-foreground/40">· {summary}</span> : null}
        {hasContent ? (
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform",
              expanded && "rotate-180",
            )}
          />
        ) : null}
      </button>
      {expanded && hasContent ? (
        <div className="space-y-1 py-1">
          {isActive ? (
            <>
              {allReasoningText ? <AgentReasoningPart text={allReasoningText} /> : null}
              {toolParts.length > 0 ? <AgentRollingToolPart toolParts={toolParts} /> : null}
            </>
          ) : (
            <>
              {allReasoningText ? <AgentReasoningPart text={allReasoningText} /> : null}
              {toolParts.map((tool) => (
                <AgentToolPart
                  key={tool.toolCallId}
                  toolName={tool.toolName}
                  args={tool.args}
                  argsText={tool.argsText}
                  result={tool.result}
                />
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function AgentAssistantMessage({
  agentName,
  agentIcon,
  content,
  isRunning,
  transcript,
  startedAt,
  createdAt,
}: {
  agentName: string;
  agentIcon?: string | null;
  content: string;
  isRunning?: boolean;
  transcript?: TranscriptEntry[];
  startedAt?: number | null;
  createdAt?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasTranscript = (transcript?.length ?? 0) > 0;

  return (
    <div className="flex items-start gap-2.5 py-1.5 max-w-[85%]">
      <Avatar size="sm" className="mt-0.5 shrink-0">
        {agentIcon ? (
          <AvatarFallback>
            <AgentIcon icon={agentIcon} className="h-3.5 w-3.5" />
          </AvatarFallback>
        ) : (
          <AvatarFallback>{initialsForName(agentName)}</AvatarFallback>
        )}
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{agentName}</span>
          {isRunning ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </span>
          ) : null}
        </div>

        <div className="space-y-3">
          {hasTranscript ? (
            <AgentChainOfThought transcript={transcript!} isActive={!!isRunning} startedAt={startedAt} />
          ) : null}
          {content ? (
            <MarkdownBody className="text-sm leading-6">{content}</MarkdownBody>
          ) : isRunning && !hasTranscript ? (
            <div className="flex items-center gap-2.5 rounded-lg px-1 py-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <span className="shimmer-text">Working...</span>
              </span>
            </div>
          ) : null}
        </div>

        {!isRunning && (content || hasTranscript) ? (
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Copy message"
              aria-label="Copy message"
              onClick={() => {
                void navigator.clipboard.writeText(content).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {createdAt ? (
              <span className="text-[11px] text-muted-foreground/50">{new Date(createdAt).toLocaleTimeString()}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
