import type { CollectorResult } from "../collectors/index.js";
import { LlmClient, type LlmMessage } from "./client.js";
import { SUMMARIZER_SYSTEM_PROMPT } from "./prompts.js";

interface ServiceStats {
  serviceName: string;
  totalChecks: number;
  healthyChecks: number;
  uptimePct: number;
  avgLatencyMs: number | null;
  errorCount: number;
}

function aggregateSnapshots(snapshots: CollectorResult[][]): ServiceStats[] {
  const statsMap = new Map<
    string,
    {
      serviceName: string;
      total: number;
      healthy: number;
      latencies: number[];
      errors: number;
    }
  >();

  for (const snapshot of snapshots) {
    for (const result of snapshot) {
      const existing = statsMap.get(result.serviceId);
      if (existing) {
        existing.total++;
        if (result.status === "healthy") existing.healthy++;
        if (result.latencyMs !== undefined) existing.latencies.push(result.latencyMs);
        if (result.error) existing.errors++;
      } else {
        statsMap.set(result.serviceId, {
          serviceName: result.serviceName,
          total: 1,
          healthy: result.status === "healthy" ? 1 : 0,
          latencies: result.latencyMs !== undefined ? [result.latencyMs] : [],
          errors: result.error ? 1 : 0,
        });
      }
    }
  }

  const stats: ServiceStats[] = [];
  for (const [, s] of statsMap) {
    const avgLatencyMs =
      s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null;
    stats.push({
      serviceName: s.serviceName,
      totalChecks: s.total,
      healthyChecks: s.healthy,
      uptimePct: s.total > 0 ? Math.round((s.healthy / s.total) * 100 * 10) / 10 : 0,
      avgLatencyMs,
      errorCount: s.errors,
    });
  }
  return stats;
}

export async function summarizeHistory(snapshots: CollectorResult[][], client: LlmClient): Promise<string> {
  if (snapshots.length === 0) {
    return "No snapshot data available for summary.";
  }

  const stats = aggregateSnapshots(snapshots);
  const totalSnapshots = snapshots.length;

  const userMessage = `Here are the aggregated infrastructure stats from the last ${totalSnapshots} health checks (approximately 24 hours):

${JSON.stringify(stats, null, 2)}

Please generate a concise executive summary in Markdown format as specified.`;

  const messages: LlmMessage[] = [
    { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  try {
    return await client.chat(messages);
  } catch (err) {
    return `Summary generation failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
