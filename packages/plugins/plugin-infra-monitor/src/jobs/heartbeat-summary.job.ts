import type { PluginContext, PluginJobContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, JOB_KEYS, STATE_KEYS } from "../constants.js";
import type { CollectorResult } from "../collectors/index.js";
import { LlmClient } from "../llm/client.js";
import { summarizeHistory } from "../llm/summarizer.js";

interface InfraConfig {
  llmUrl?: string;
  llmModel?: string;
}

export function createHeartbeatSummaryJob(ctx: PluginContext) {
  return async function heartbeatSummaryHandler(job: PluginJobContext): Promise<void> {
    ctx.logger.info("Starting daily heartbeat summary", { runId: job.runId, jobKey: JOB_KEYS.heartbeatSummary });

    const raw = (await ctx.config.get()) as Partial<InfraConfig>;
    const llmUrl = raw.llmUrl ?? DEFAULT_CONFIG.llmUrl;
    const llmModel = raw.llmModel ?? DEFAULT_CONFIG.llmModel;

    // Read snapshot history
    const historyRaw = await ctx.state.get({
      scopeKind: "instance",
      stateKey: STATE_KEYS.snapshotHistory,
    });
    const snapshots: CollectorResult[][] = Array.isArray(historyRaw) ? (historyRaw as CollectorResult[][]) : [];

    let summary = "No snapshot data available for daily summary.";

    if (llmUrl && snapshots.length > 0) {
      const fetcher = ctx.http.fetch.bind(ctx.http);
      const llmClient = new LlmClient({ url: llmUrl, model: llmModel }, fetcher);
      summary = await summarizeHistory(snapshots, llmClient);
      ctx.logger.info("Daily summary generated", { snapshotCount: snapshots.length });
    } else if (snapshots.length === 0) {
      ctx.logger.warn("No snapshots available for heartbeat summary");
    } else {
      ctx.logger.info("LLM not configured, skipping AI summary");
      summary = `Infrastructure summary: ${snapshots.length} snapshots recorded. LLM analysis not configured.`;
    }

    // Log activity for each accessible company
    try {
      const companies = await ctx.companies.list({ limit: 50 });
      for (const company of companies) {
        await ctx.activity.log({
          companyId: company.id,
          message: `Daily infrastructure summary: ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}`,
          metadata: { snapshotCount: snapshots.length, fullSummary: summary },
        });
      }
    } catch {
      // Best-effort activity logging
    }

    ctx.logger.info("Heartbeat summary job finished", { runId: job.runId });
  };
}
