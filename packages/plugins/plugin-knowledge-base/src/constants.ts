export const PLUGIN_ID = "paperclip.knowledge-base";
export const PLUGIN_VERSION = "0.1.0";
export const KB_ENTITY_TYPE = "kb-entry";
export const PAGE_ROUTE = "kb";

export const TOOL_NAMES = {
  write: "kb-write",
  read: "kb-read",
  update: "kb-update",
  deprecate: "kb-deprecate",
} as const;

export const SLOT_IDS = {
  page: "kb-page",
  dashboardWidget: "kb-dashboard-widget",
  issueTab: "kb-issue-tab",
} as const;

export const EXPORT_NAMES = {
  page: "KBPage",
  dashboardWidget: "KBDashboardWidget",
  issueTab: "KBIssueTab",
} as const;

export const JOB_KEYS = {
  decay: "kb-decay",
} as const;
