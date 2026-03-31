import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
} from "@paperclipai/plugin-sdk";
import { DATA_KEYS, DEFAULT_CONFIG, JOB_KEYS, PLUGIN_ID, STATE_KEYS } from "./constants.js";
import { createHealthCheckJob } from "./jobs/health-check.job.js";
import { createHeartbeatSummaryJob } from "./jobs/heartbeat-summary.job.js";
import type { CollectorResult } from "./collectors/index.js";
import type { AnalysisResult } from "./llm/analyzer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InfraConfig {
  dokployUrl?: string;
  dokployApiKey?: string;
  llmUrl?: string;
  llmModel?: string;
  checkIntervalMinutes?: number;
  extraServices?: unknown[];
}

interface LatestSnapshotState {
  results: CollectorResult[];
  checkedAt: string;
  analysis?: AnalysisResult;
}

interface DashboardData {
  configured: boolean;
  latestSnapshot: LatestSnapshotState | null;
  lastCheckedAt: string | null;
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

let currentContext: PluginContext | null = null;

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    ctx.logger.info("Infrastructure Monitor plugin initializing", { pluginId: PLUGIN_ID });

    // Register job handlers
    ctx.jobs.register(JOB_KEYS.healthCheck, createHealthCheckJob(ctx));
    ctx.jobs.register(JOB_KEYS.heartbeatSummary, createHeartbeatSummaryJob(ctx));

    // Register data handlers for UI bridge
    ctx.data.register(DATA_KEYS.dashboard, async (): Promise<DashboardData> => {
      const config = (await ctx.config.get()) as Partial<InfraConfig>;
      const configured = !!(
        config.dokployUrl ||
        (config.extraServices && (config.extraServices as unknown[]).length > 0)
      );

      const raw = await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEYS.latestSnapshot,
      });

      const latestSnapshot = raw as LatestSnapshotState | null;

      return {
        configured,
        latestSnapshot: latestSnapshot ?? null,
        lastCheckedAt: latestSnapshot?.checkedAt ?? null,
      };
    });

    ctx.data.register(DATA_KEYS.snapshots, async (): Promise<CollectorResult[][]> => {
      const raw = await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEYS.snapshotHistory,
      });
      return Array.isArray(raw) ? (raw as CollectorResult[][]) : [];
    });

    ctx.logger.info("Infrastructure Monitor plugin setup complete");
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    if (!ctx) {
      return { status: "degraded", message: "Plugin context not initialized" };
    }
    try {
      const raw = await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEYS.latestSnapshot,
      });
      const snapshot = raw as LatestSnapshotState | null;
      if (snapshot?.checkedAt) {
        return { status: "ok", message: `Last check: ${snapshot.checkedAt}` };
      }
      return { status: "ok", message: "Waiting for first health check run" };
    } catch (err) {
      return {
        status: "degraded",
        message: `State read failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },

  async onValidateConfig(config) {
    const c = config as Partial<InfraConfig>;

    if (c.dokployUrl && typeof c.dokployUrl === "string" && c.dokployUrl.trim()) {
      try {
        new URL(c.dokployUrl);
      } catch {
        return { ok: false, errors: ["dokployUrl must be a valid URL (e.g. https://dokploy.example.com)"] };
      }
    }

    if (c.llmUrl && typeof c.llmUrl === "string" && c.llmUrl.trim()) {
      try {
        new URL(c.llmUrl);
      } catch {
        return { ok: false, errors: ["llmUrl must be a valid URL (e.g. http://localhost:11434)"] };
      }
    }

    if (
      c.checkIntervalMinutes !== undefined &&
      (typeof c.checkIntervalMinutes !== "number" || c.checkIntervalMinutes < 1)
    ) {
      return { ok: false, errors: ["checkIntervalMinutes must be a positive number"] };
    }

    return { ok: true };
  },
});

runWorker(plugin, import.meta.url);
