import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { EXPORT_NAMES, JOB_KEYS, PAGE_ROUTE, PLUGIN_ID, PLUGIN_VERSION, SLOT_IDS, TOOL_NAMES } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Knowledge Base",
  description: "Organizational memory for agents and teams. Store, search, and deprecate knowledge entries.",
  author: "Paperclip",
  categories: ["automation", "ui"],
  capabilities: [
    "agent.tools.register",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "events.subscribe",
    "jobs.schedule",
    "issues.read",
    "issue.comments.read",
    "companies.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  tools: [
    {
      name: TOOL_NAMES.write,
      displayName: "KB Write",
      description:
        "Create or update a knowledge base entry. Use to store reusable facts, decisions, runbooks, and learnings.",
      parametersSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short descriptive title for the entry." },
          description: { type: "string", description: "Full content of the knowledge entry." },
          type: { type: "string", description: "Category: fact, decision, runbook, learning, or reference." },
          tags: { type: "array", items: { type: "string" }, description: "Tags for filtering." },
          externalId: { type: "string", description: "Optional stable key for upserts." },
        },
        required: ["title", "description"],
      },
    },
    {
      name: TOOL_NAMES.read,
      displayName: "KB Read",
      description: "List and search knowledge base entries with optional type, tag, and text filters.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text search across title and description." },
          type: { type: "string", description: "Filter by entry type." },
          tags: { type: "array", items: { type: "string" }, description: "Entries must have all these tags." },
          status: { type: "string", description: "active (default) or deprecated." },
          limit: { type: "number", description: "Max entries to return (default 20, max 100)." },
        },
      },
    },
    {
      name: TOOL_NAMES.update,
      displayName: "KB Update",
      description: "Update an existing knowledge base entry by ID.",
      parametersSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Entity ID to update." },
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      },
    },
    {
      name: TOOL_NAMES.deprecate,
      displayName: "KB Deprecate",
      description: "Mark a knowledge base entry as deprecated with an optional reason.",
      parametersSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Entity ID to deprecate." },
          reason: { type: "string", description: "Reason for deprecation." },
        },
        required: ["id"],
      },
    },
  ],
  jobs: [
    {
      jobKey: JOB_KEYS.decay,
      displayName: "KB Decay",
      description: "Marks stale, low-access knowledge base entries as deprecated (runs weekly).",
      schedule: "0 3 * * 0",
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "Knowledge Base",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "Knowledge Base",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "detailTab",
        id: SLOT_IDS.issueTab,
        displayName: "Knowledge Base",
        exportName: EXPORT_NAMES.issueTab,
        entityTypes: ["issue"],
      },
    ],
  },
};

export default manifest;
