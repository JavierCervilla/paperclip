import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { Anomaly } from "../llm/analyzer.js";
import type { CollectorResult } from "../collectors/index.js";
import { STATE_KEYS } from "../constants.js";

export async function runAlertJob(
  ctx: PluginContext,
  anomaly: Anomaly,
  snapshot: CollectorResult[],
  companyId: string,
): Promise<void> {
  try {
    // Read open alert issues map from state
    const openAlerts = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: STATE_KEYS.openAlertIssues,
    })) as Record<string, string> | null;

    const existing = openAlerts?.[anomaly.serviceId];

    if (existing) {
      // Issue already open for this service — skip deduplication
      ctx.logger.debug("Alert already open for service, skipping", {
        serviceId: anomaly.serviceId,
        issueId: existing,
      });
      return;
    }

    // Find the service name from the snapshot
    const serviceResult = snapshot.find((r) => r.serviceId === anomaly.serviceId);
    const serviceName = serviceResult?.serviceName ?? anomaly.serviceId;

    const description = [
      `**Alert:** ${anomaly.description}`,
      "",
      `**Severity:** ${anomaly.severity}`,
      `**Service:** ${serviceName} (\`${anomaly.serviceId}\`)`,
      `**Suggested Action:** ${anomaly.suggestedAction}`,
      "",
      "---",
      "**Snapshot at time of alert:**",
      "```json",
      JSON.stringify(serviceResult ?? null, null, 2),
      "```",
    ].join("\n");

    const issue = await ctx.issues.create({
      companyId,
      title: `[ALERT] ${serviceName} — ${anomaly.description}`,
      description,
      priority: anomaly.severity === "critical" ? "critical" : anomaly.severity === "warning" ? "medium" : "low",
    });

    ctx.logger.info("Created alert issue", {
      serviceId: anomaly.serviceId,
      issueId: issue.id,
      severity: anomaly.severity,
    });

    // Store the issue ID so we don't create duplicates
    const updated: Record<string, string> = { ...(openAlerts ?? {}), [anomaly.serviceId]: issue.id };
    await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEYS.openAlertIssues }, updated);
  } catch (err) {
    ctx.logger.error("Failed to create alert issue", {
      serviceId: anomaly.serviceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
