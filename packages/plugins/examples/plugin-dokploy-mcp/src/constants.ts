export const PLUGIN_ID = "paperclip-dokploy-mcp";
export const PLUGIN_VERSION = "0.1.0";

export const SLOT_IDS = {
  settingsPage: "dokploy-mcp-settings-page",
} as const;

export const EXPORT_NAMES = {
  settingsPage: "DokployMcpSettingsPage",
} as const;

export const TOOL_NAMES = {
  getLogs: "dokploy-get-logs",
  listApplications: "dokploy-list-applications",
  getApplicationStatus: "dokploy-get-application-status",
  redeploy: "dokploy-redeploy",
  getApplicationStats: "dokploy-get-application-stats",
} as const;

export const DEFAULT_CONFIG = {
  dokployMcpUrl: "",
} as const;
