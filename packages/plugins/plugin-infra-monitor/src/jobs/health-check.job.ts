import type { PluginContext, PluginJobContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, JOB_KEYS, STATE_KEYS } from "../constants.js";
import { HttpCollector } from "../collectors/http.js";
import { DokployCollector } from "../collectors/dokploy.js";
import { runAllCollectors, type CollectorResult } from "../collectors/index.js";
import { LlmClient } from "../llm/client.js";
import { analyzeResults, type AnalysisResult } from "../llm/analyzer.js";
import { runAlertJob } from "./alert.job.js";

const MAX_HISTORY_LENGTH = 288; // 24h at 5-min intervals

interface InfraConfig {
  dokployUrl?: string;
  dokployApiKey?: string;
  llmUrl?: string;
  llmModel?: string;
  checkIntervalMinutes?: number;
  extraServices?: Array<{ serviceId: string; serviceName: string; url: string }>;
}

export function createHealthCheckJob(ctx: PluginContext) {
  return async function healthCheckHandler(job: PluginJobContext): Promise<void> {
    ctx.logger.info("Starting infrastructure health check", { runId: job.runId, jobKey: JOB_KEYS.healthCheck });

    const raw = (await ctx.config.get()) as Partial<InfraConfig>;
    const config: Required<InfraConfig> = {
      dokployUrl: raw.dokployUrl ?? DEFAULT_CONFIG.dokployUrl,
      dokployApiKey: raw.dokployApiKey ?? DEFAULT_CONFIG.dokployApiKey,
      llmUrl: raw.llmUrl ?? DEFAULT_CONFIG.llmUrl,
      llmModel: raw.llmModel ?? DEFAULT_CONFIG.llmModel,
      checkIntervalMinutes: raw.checkIntervalMinutes ?? DEFAULT_CONFIG.checkIntervalMinutes,
      extraServices: (raw.extraServices as Array<{ serviceId: string; serviceName: string; url: string }>) ?? [],
    };

    const fetcher = ctx.http.fetch.bind(ctx.http);

    // Build collectors
    const collectors = [];

    // HTTP collectors for extra services
    for (const svc of config.extraServices) {
      collectors.push(
        new HttpCollector({ serviceId: svc.serviceId, serviceName: svc.serviceName, url: svc.url }, fetcher),
      );
    }

    // Dokploy collector
    if (config.dokployUrl) {
      let apiKey = config.dokployApiKey;
      // Resolve secret ref if needed
      if (apiKey && apiKey.startsWith("$")) {
        try {
          apiKey = await ctx.secrets.resolve(apiKey.slice(1));
        } catch {
          apiKey = config.dokployApiKey;
        }
      }
      collectors.push(new DokployCollector({ baseUrl: config.dokployUrl, apiKey }, fetcher));
    }

    const results: CollectorResult[] = await runAllCollectors(collectors);
    const checkedAt = new Date().toISOString();

    ctx.logger.info("Health check completed", { resultCount: results.length, checkedAt });

    // Save latest snapshot
    await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEYS.latestSnapshot }, { results, checkedAt });

    // Append to snapshot history
    const historyRaw = await ctx.state.get({
      scopeKind: "instance",
      stateKey: STATE_KEYS.snapshotHistory,
    });
    const history: CollectorResult[][] = Array.isArray(historyRaw) ? (historyRaw as CollectorResult[][]) : [];
    history.push(results);
    if (history.length > MAX_HISTORY_LENGTH) {
      history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }
    await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEYS.snapshotHistory }, history);

    // Run LLM analysis if configured
    let analysis: AnalysisResult | null = null;
    if (config.llmUrl) {
      const llmClient = new LlmClient({ url: config.llmUrl, model: config.llmModel }, fetcher);
      analysis = await analyzeResults(results, llmClient);

      ctx.logger.info("LLM analysis complete", {
        overallStatus: analysis.overallStatus,
        anomalyCount: analysis.anomalies.length,
      });

      // Create issues for critical anomalies
      for (const anomaly of analysis.anomalies) {
        if (anomaly.severity === "critical") {
          // We need a companyId — get it from the instance companies list
          // Since this is instance-scoped, we read from the first available company.
          try {
            const companies = await ctx.companies.list({ limit: 1 });
            const companyId = companies[0]?.id;
            if (companyId) {
              await runAlertJob(ctx, anomaly, results, companyId);
            }
          } catch (err) {
            ctx.logger.warn("Could not resolve companyId for alert", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // Save analysis alongside the latest snapshot
    await ctx.state.set(
      { scopeKind: "instance", stateKey: STATE_KEYS.latestSnapshot },
      { results, checkedAt, analysis },
    );

    // Log activity for each accessible company
    try {
      const companies = await ctx.companies.list({ limit: 50 });
      for (const company of companies) {
        await ctx.activity.log({
          companyId: company.id,
          message: `Infrastructure health check completed: ${results.length} service(s) checked. Overall: ${analysis?.overallStatus ?? "checked"}`,
          metadata: {
            resultCount: results.length,
            overallStatus: analysis?.overallStatus,
            anomalyCount: analysis?.anomalies.length ?? 0,
          },
        });
      }
    } catch {
      // Best-effort activity logging
    }

    ctx.logger.info("Health check job finished", { runId: job.runId });
  };
}
