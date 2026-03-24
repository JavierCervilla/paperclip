import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { ToolResult } from "@paperclipai/plugin-sdk";
import { randomUUID } from "crypto";
import { KB_ENTITY_TYPE, TOOL_NAMES } from "./constants.js";

type KBEntryData = {
  description: string;
  type: string;
  tags: string[];
  accessCount: number;
  createdAt: string;
  updatedAt?: string;
  deprecatedAt?: string;
  deprecatedReason?: string;
};

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Knowledge Base plugin ready");

    // kb-write
    ctx.tools.register(
      TOOL_NAMES.write,
      {
        displayName: "KB Write",
        description: "Create or update a knowledge base entry.",
        parametersSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            externalId: { type: "string" },
          },
          required: ["title", "description"],
        },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const p = params as { title?: string; description?: string; type?: string; tags?: string[]; externalId?: string };
        const title = (p.title ?? "").trim();
        const description = (p.description ?? "").trim();
        if (!title || !description) {
          return { content: "title and description are required.", data: { error: "missing_fields" } };
        }
        const record = await ctx.entities.upsert({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: p.externalId ?? randomUUID(),
          title,
          status: "active",
          data: {
            description,
            type: p.type ?? "fact",
            tags: Array.isArray(p.tags) ? p.tags : [],
            accessCount: 0,
            createdAt: new Date().toISOString(),
          } satisfies KBEntryData,
        });
        return { content: "Created KB entry: " + title + " (id: " + record.id + ")", data: record };
      },
    );

    // kb-read
    ctx.tools.register(
      TOOL_NAMES.read,
      {
        displayName: "KB Read",
        description: "List and search knowledge base entries.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            status: { type: "string" },
            limit: { type: "number" },
          },
        },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const p = params as { query?: string; type?: string; tags?: string[]; status?: string; limit?: number };
        const limit = Math.min(p.limit ?? 20, 100);
        const status = p.status ?? "active";
        const records = await ctx.entities.list({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          status,
          limit,
          offset: 0,
        });
        let filtered = records;
        if (p.type) {
          filtered = filtered.filter((r) => (r.data as KBEntryData)?.type === p.type);
        }
        if (Array.isArray(p.tags) && p.tags.length > 0) {
          filtered = filtered.filter((r) => {
            const t = (r.data as KBEntryData)?.tags ?? [];
            return p.tags!.every((tag) => t.includes(tag));
          });
        }
        if (p.query) {
          const q = p.query.toLowerCase();
          filtered = filtered.filter((r) => {
            const d = r.data as KBEntryData;
            return r.title.toLowerCase().includes(q) || (d?.description ?? "").toLowerCase().includes(q);
          });
        }
        if (filtered.length === 0) {
          return { content: "No matching KB entries found.", data: [] };
        }
        const summary = filtered.map((r) => {
          const d = r.data as KBEntryData;
          return "[" + r.id + "] **" + r.title + "** (" + (d?.type ?? "?") + ") — " + (d?.description ?? "").slice(0, 120);
        }).join("\n");
        return { content: summary, data: filtered };
      },
    );

    // kb-update
    ctx.tools.register(
      TOOL_NAMES.update,
      {
        displayName: "KB Update",
        description: "Update an existing knowledge base entry.",
        parametersSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["id"],
        },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const p = params as { id?: string; title?: string; description?: string; type?: string; tags?: string[] };
        if (!p.id) return { content: "id is required.", data: { error: "missing_id" } };
        const records = await ctx.entities.list({ entityType: KB_ENTITY_TYPE, scopeKind: "company", scopeId: runCtx.companyId, limit: 1000, offset: 0 });
        const existing = records.find((r) => r.id === p.id);
        if (!existing) return { content: "KB entry " + p.id + " not found.", data: { error: "not_found" } };
        const d = existing.data as KBEntryData;
        const updated = await ctx.entities.upsert({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: existing.externalId ?? p.id,
          title: p.title ?? existing.title,
          status: existing.status,
          data: { ...d, ...(p.description ? { description: p.description } : {}), ...(p.type ? { type: p.type } : {}), ...(p.tags ? { tags: p.tags } : {}), updatedAt: new Date().toISOString() },
        });
        return { content: "Updated KB entry: " + updated.title, data: updated };
      },
    );

    // kb-deprecate
    ctx.tools.register(
      TOOL_NAMES.deprecate,
      {
        displayName: "KB Deprecate",
        description: "Mark a knowledge base entry as deprecated.",
        parametersSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
          },
          required: ["id"],
        },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const p = params as { id?: string; reason?: string };
        if (!p.id) return { content: "id is required.", data: { error: "missing_id" } };
        const records = await ctx.entities.list({ entityType: KB_ENTITY_TYPE, scopeKind: "company", scopeId: runCtx.companyId, limit: 1000, offset: 0 });
        const existing = records.find((r) => r.id === p.id);
        if (!existing) return { content: "KB entry " + p.id + " not found.", data: { error: "not_found" } };
        const d = existing.data as KBEntryData;
        const updated = await ctx.entities.upsert({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: existing.externalId ?? p.id,
          title: existing.title,
          status: "deprecated",
          data: { ...d, deprecatedAt: new Date().toISOString(), deprecatedReason: p.reason ?? "No reason provided" },
        });
        return { content: "Deprecated KB entry: " + updated.title, data: updated };
      },
    );

    // Data endpoint for UI
    ctx.data.register("kb-entries", async (params) => {
      const p = params as { status?: string; limit?: number; query?: string; companyId?: string };
      const records = await ctx.entities.list({
        entityType: KB_ENTITY_TYPE,
        scopeKind: "company",
        scopeId: typeof p.companyId === "string" ? p.companyId : undefined,
        status: typeof p.status === "string" ? p.status : "active",
        limit: Math.min(typeof p.limit === "number" ? p.limit : 50, 100),
        offset: 0,
      });
      if (typeof p.query === "string" && p.query.trim()) {
        const q = p.query.toLowerCase();
        return records.filter((r) => {
          const d = r.data as KBEntryData;
          return r.title.toLowerCase().includes(q) || (d?.description ?? "").toLowerCase().includes(q);
        });
      }
      return records;
    });
  },

  async onHealth() {
    return { status: "ok", message: "Knowledge Base plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
