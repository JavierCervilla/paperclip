export const PLUGIN_ID = "paperclip-sentry";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "sentry";

export const SLOT_IDS = {
  page: "sentry-page",
  settingsPage: "sentry-settings-page",
  dashboardWidget: "sentry-dashboard-widget",
  sidebar: "sentry-sidebar-link",
} as const;

export const EXPORT_NAMES = {
  page: "SentryPage",
  settingsPage: "SentrySettingsPage",
  dashboardWidget: "SentryDashboardWidget",
  sidebar: "SentrySidebarLink",
} as const;

export const TOOL_NAMES = {
  listIssues: "sentry.list-issues",
  getIssue: "sentry.get-issue",
  search: "sentry.search",
} as const;

export const DATA_KEYS = {
  overview: "overview",
  issueDetail: "issue-detail",
  issueEvents: "issue-events",
} as const;

export const DEFAULT_CONFIG = {
  authToken: "",
  organizationSlug: "",
  projectSlug: "",
  sentryBaseUrl: "https://sentry.io",
} as const;
