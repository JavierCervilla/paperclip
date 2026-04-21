export const PLUGIN_ID = "paperclip-plugin-obsidian";
export const PLUGIN_VERSION = "0.1.0";

export const SLOT_IDS = {
  settingsPage: "obsidian-settings-page",
  dashboardWidget: "obsidian-dashboard-widget",
} as const;

export const EXPORT_NAMES = {
  settingsPage: "ObsidianSettingsPage",
  dashboardWidget: "ObsidianDashboardWidget",
} as const;

export const JOB_KEYS = {
  sync: "obsidian-sync",
} as const;

export const DATA_KEYS = {
  syncHealth: "sync-health",
  syncLog: "sync-log",
} as const;

export const ACTION_KEYS = {
  triggerSync: "trigger-sync",
} as const;

export const STATE_KEYS = {
  lastSyncCursor: "last-sync-cursor",
  syncConfig: "sync-config",
} as const;

export type SyncEntityType = "issues" | "goals";

export interface ObsidianPluginConfig {
  vaultPath: string;
  gitRemoteUrl: string;
  gitBranch: string;
  syncEntities: SyncEntityType[];
  syncIntervalMinutes: number;
  folderStructure: "by-project" | "flat";
  includeComments: boolean;
  maxCommentsPerIssue: number;
}

export const DEFAULT_CONFIG: ObsidianPluginConfig = {
  vaultPath: "",
  gitRemoteUrl: "",
  gitBranch: "main",
  syncEntities: ["issues", "goals"],
  syncIntervalMinutes: 15,
  folderStructure: "by-project",
  includeComments: true,
  maxCommentsPerIssue: 10,
};
