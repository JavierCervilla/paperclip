import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, EXPORT_NAMES, PAGE_ROUTE, PLUGIN_ID, PLUGIN_VERSION, SLOT_IDS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Infrastructure Monitor",
  description:
    "Monitors infrastructure (HTTP endpoints, Dokploy apps, Docker containers, databases, blockchain nodes), runs LLM analysis, creates Paperclip issues for critical alerts, and shows a real-time dashboard UI.",
  author: "Paperclip",
  categories: ["connector", "ui"],
  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "issues.create",
    "issues.read",
    "companies.read",
    "instance.settings.register",
    "ui.sidebar.register",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  jobs: [
    {
      jobKey: "health-check",
      schedule: "*/5 * * * *",
      displayName: "Infrastructure Health Check",
      description: "Runs health checks against all configured infrastructure services.",
    },
    {
      jobKey: "heartbeat-summary",
      schedule: "0 8 * * *",
      displayName: "Daily Infrastructure Summary",
      description: "Generates a daily executive summary of infrastructure health.",
    },
  ],
  instanceConfigSchema: {
    type: "object",
    properties: {
      dokployUrl: {
        type: "string",
        title: "Dokploy Base URL",
        description: "Base URL of your Dokploy instance (e.g. https://dokploy.example.com).",
        default: DEFAULT_CONFIG.dokployUrl,
      },
      dokployApiKey: {
        type: "string",
        format: "secret-ref",
        title: "Dokploy API Key",
        description: "API key for authenticating with Dokploy.",
        default: DEFAULT_CONFIG.dokployApiKey,
      },
      llmUrl: {
        type: "string",
        title: "LLM Base URL",
        description: "Base URL of the Ollama-compatible LLM endpoint for anomaly analysis.",
        default: DEFAULT_CONFIG.llmUrl,
      },
      llmModel: {
        type: "string",
        title: "LLM Model",
        description: "Model name to use for LLM analysis (e.g. llama3, mistral).",
        default: DEFAULT_CONFIG.llmModel,
      },
      checkIntervalMinutes: {
        type: "number",
        title: "Check Interval (minutes)",
        description: "How often to run infrastructure health checks.",
        default: DEFAULT_CONFIG.checkIntervalMinutes,
      },
      extraServices: {
        type: "array",
        title: "Extra HTTP Services",
        description: "Additional HTTP endpoints to monitor.",
        items: {
          type: "object",
          properties: {
            serviceId: { type: "string" },
            serviceName: { type: "string" },
            url: { type: "string" },
          },
        },
        default: [],
      },
    },
  },
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "Infrastructure",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "Infrastructure Monitor Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "Infrastructure Status",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: "Infrastructure",
        exportName: EXPORT_NAMES.sidebar,
      },
    ],
  },
};

export default manifest;
