export const PLUGIN_ID = "infra-monitor";
export const PLUGIN_VERSION = "0.1.0";

export const SLOT_IDS = {
  page: "infra-monitor-page",
  dashboardWidget: "infra-monitor-widget",
  settingsPage: "infra-monitor-settings",
  sidebar: "infra-monitor-sidebar",
} as const;

export const EXPORT_NAMES = {
  page: "InfraMonitorPage",
  dashboardWidget: "InfraMonitorWidget",
  settingsPage: "InfraMonitorSettingsPage",
  sidebar: "InfraMonitorSidebar",
} as const;

export const DATA_KEYS = {
  dashboard: "infra-dashboard",
  snapshots: "infra-snapshots",
} as const;

export const JOB_KEYS = {
  healthCheck: "health-check",
  heartbeatSummary: "heartbeat-summary",
} as const;

export const STATE_KEYS = {
  latestSnapshot: "latest-snapshot",
  snapshotHistory: "snapshot-history",
  openAlertIssues: "open-alert-issues",
} as const;

export const PAGE_ROUTE = "infra";

export const DEFAULT_CONFIG = {
  dokployUrl: "",
  dokployApiKey: "",
  llmUrl: "http://localhost:11434",
  llmModel: "llama3",
  checkIntervalMinutes: 5,
  extraServices: [] as Array<{ serviceId: string; serviceName: string; url: string }>,
};
