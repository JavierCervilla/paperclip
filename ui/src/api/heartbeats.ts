import type {
  HeartbeatRun,
  HeartbeatRunEvent,
  InstanceSchedulerHeartbeatAgent,
  WorkspaceOperation,
} from "@paperclipai/shared";
import { api } from "./client";

export interface RunLivenessFields {
  livenessState: HeartbeatRun["livenessState"];
  livenessReason: string | null;
  continuationAttempt: number;
  lastUsefulActionAt: string | Date | null;
  nextAction: string | null;
}

export interface ActiveRunForIssue {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  contextCommentId?: string | null;
  contextWakeCommentId?: string | null;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
  createdAt: string | Date;
  agentId: string;
  agentName: string;
  adapterType: string;
  logBytes?: number | null;
  lastOutputBytes?: number | null;
  issueId?: string | null;
  livenessState?: RunLivenessFields["livenessState"];
  livenessReason?: string | null;
  continuationAttempt?: number;
  lastUsefulActionAt?: string | Date | null;
  nextAction?: string | null;
  outputSilence?: HeartbeatRun["outputSilence"];
}

export interface LiveRunForIssue {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  contextCommentId?: string | null;
  contextWakeCommentId?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  logBytes?: number | null;
  lastOutputBytes?: number | null;
  issueId?: string | null;
  livenessState?: RunLivenessFields["livenessState"];
  livenessReason?: string | null;
  continuationAttempt?: number;
  lastUsefulActionAt?: string | null;
  nextAction?: string | null;
  outputSilence?: HeartbeatRun["outputSilence"];
}

export interface WatchdogDecisionInput {
  runId: string;
  decision: "snooze" | "continue" | "dismissed_false_positive";
  evaluationIssueId?: string | null;
  reason?: string | null;
  snoozedUntil?: string | null;
}

export interface AgentHeartbeatStats {
  agentId: string;
  agentName: string;
  agentStatus: string;
  adapterType: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  timedOutRuns: number;
  otherRuns: number;
  successRate: number;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
  minDurationMs: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  consecutiveFailures: number;
  isStuck: boolean;
}

export interface DailyStats {
  date: string;
  succeeded: number;
  failed: number;
  timedOut: number;
  other: number;
  avgDurationMs: number | null;
}

export interface HeartbeatStatsResponse {
  companyId: string;
  periodDays: number;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  overallSuccessRate: number;
  avgDurationMs: number | null;
  stuckAgentCount: number;
  agents: AgentHeartbeatStats[];
  dailyStats: DailyStats[];
}

export const heartbeatsApi = {
  list: (companyId: string, agentId?: string, limit?: number) => {
    const searchParams = new URLSearchParams();
    if (agentId) searchParams.set("agentId", agentId);
    if (limit) searchParams.set("limit", String(limit));
    const qs = searchParams.toString();
    return api.get<HeartbeatRun[]>(`/companies/${companyId}/heartbeat-runs${qs ? `?${qs}` : ""}`);
  },
  get: (runId: string) => api.get<HeartbeatRun>(`/heartbeat-runs/${runId}`),
  events: (runId: string, afterSeq = 0, limit = 200) =>
    api.get<HeartbeatRunEvent[]>(
      `/heartbeat-runs/${runId}/events?afterSeq=${encodeURIComponent(String(afterSeq))}&limit=${encodeURIComponent(String(limit))}`,
    ),
  log: (runId: string, offset = 0, limitBytes = 256000) =>
    api.get<{ runId: string; store: string; logRef: string; content: string; nextOffset?: number }>(
      `/heartbeat-runs/${runId}/log?offset=${encodeURIComponent(String(offset))}&limitBytes=${encodeURIComponent(String(limitBytes))}`,
    ),
  workspaceOperations: (runId: string) =>
    api.get<WorkspaceOperation[]>(`/heartbeat-runs/${runId}/workspace-operations`),
  workspaceOperationLog: (operationId: string, offset = 0, limitBytes = 256000) =>
    api.get<{ operationId: string; store: string; logRef: string; content: string; nextOffset?: number }>(
      `/workspace-operations/${operationId}/log?offset=${encodeURIComponent(String(offset))}&limitBytes=${encodeURIComponent(String(limitBytes))}`,
    ),
  cancel: (runId: string) => api.post<void>(`/heartbeat-runs/${runId}/cancel`, {}),
  recordWatchdogDecision: (input: WatchdogDecisionInput) =>
    api.post(`/heartbeat-runs/${input.runId}/watchdog-decisions`, {
      decision: input.decision,
      evaluationIssueId: input.evaluationIssueId ?? null,
      reason: input.reason ?? null,
      snoozedUntil: input.snoozedUntil ?? null,
    }),
  liveRunsForIssue: (issueId: string) =>
    api.get<LiveRunForIssue[]>(`/issues/${issueId}/live-runs`),
  activeRunForIssue: (issueId: string) =>
    api.get<ActiveRunForIssue | null>(`/issues/${issueId}/active-run`),
  liveRunsForCompany: (
    companyId: string,
    options?: number | { minCount?: number; limit?: number },
  ) => {
    const searchParams = new URLSearchParams();
    if (typeof options === "number") {
      searchParams.set("minCount", String(options));
    } else if (options) {
      if (options.minCount) searchParams.set("minCount", String(options.minCount));
      if (options.limit) searchParams.set("limit", String(options.limit));
    }
    const qs = searchParams.toString();
    return api.get<LiveRunForIssue[]>(`/companies/${companyId}/live-runs${qs ? `?${qs}` : ""}`);
  },
  listInstanceSchedulerAgents: () =>
    api.get<InstanceSchedulerHeartbeatAgent[]>("/instance/scheduler-heartbeats"),
  stats: (companyId: string, periodDays?: number) =>
    api.get<HeartbeatStatsResponse>(
      `/companies/${companyId}/heartbeat-stats${periodDays ? `?periodDays=${periodDays}` : ""}`,
    ),
  runTodos: (runId: string) => api.get<RunTodo[]>(`/heartbeat-runs/${runId}/todos`),
  issueTodos: (issueId: string) => api.get<RunTodo[]>(`/issues/${issueId}/run-todos`),
};

export interface RunTodo {
  id: string;
  runId: string;
  agentId: string;
  issueId: string | null;
  label: string;
  status: "pending" | "in_progress" | "completed";
  seq: number;
  createdAt: string;
  updatedAt: string;
}
