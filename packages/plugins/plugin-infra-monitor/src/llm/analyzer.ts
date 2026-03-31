import type { CollectorResult, ServiceStatus } from "../collectors/index.js";
import { LlmClient, type LlmMessage } from "./client.js";
import { ANALYZER_SYSTEM_PROMPT } from "./prompts.js";

export interface Anomaly {
  serviceId: string;
  severity: "info" | "warning" | "critical";
  description: string;
  suggestedAction: string;
}

export interface AnalysisResult {
  anomalies: Anomaly[];
  overallStatus: ServiceStatus;
  summary: string;
  recommendedActions: string[];
}

const DEFAULT_ANALYSIS_RESULT: AnalysisResult = {
  anomalies: [],
  overallStatus: "unknown",
  summary: "LLM analysis unavailable.",
  recommendedActions: [],
};

function isValidSeverity(v: unknown): v is Anomaly["severity"] {
  return v === "info" || v === "warning" || v === "critical";
}

function isValidServiceStatus(v: unknown): v is ServiceStatus {
  return v === "healthy" || v === "degraded" || v === "down" || v === "unknown";
}

function parseAnalysisResult(raw: string): AnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ...DEFAULT_ANALYSIS_RESULT, summary: "Failed to parse LLM response as JSON." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_ANALYSIS_RESULT;
  }

  const obj = parsed as Record<string, unknown>;

  const anomalies: Anomaly[] = [];
  if (Array.isArray(obj.anomalies)) {
    for (const item of obj.anomalies) {
      if (typeof item === "object" && item !== null) {
        const a = item as Record<string, unknown>;
        if (
          typeof a.serviceId === "string" &&
          isValidSeverity(a.severity) &&
          typeof a.description === "string" &&
          typeof a.suggestedAction === "string"
        ) {
          anomalies.push({
            serviceId: a.serviceId,
            severity: a.severity,
            description: a.description,
            suggestedAction: a.suggestedAction,
          });
        }
      }
    }
  }

  const overallStatus: ServiceStatus = isValidServiceStatus(obj.overallStatus) ? obj.overallStatus : "unknown";

  const summary = typeof obj.summary === "string" ? obj.summary : "No summary provided.";

  const recommendedActions: string[] = Array.isArray(obj.recommendedActions)
    ? obj.recommendedActions.filter((a): a is string => typeof a === "string")
    : [];

  return { anomalies, overallStatus, summary, recommendedActions };
}

export async function analyzeResults(results: CollectorResult[], client: LlmClient): Promise<AnalysisResult> {
  const userMessage = `Here is the current infrastructure health snapshot:\n\n${JSON.stringify(results, null, 2)}\n\nAnalyze this snapshot and return the JSON response as specified.`;

  const messages: LlmMessage[] = [
    { role: "system", content: ANALYZER_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  try {
    const raw = await client.chat(messages);
    return parseAnalysisResult(raw);
  } catch {
    return { ...DEFAULT_ANALYSIS_RESULT, summary: "LLM analysis failed." };
  }
}
