import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginEvent, PluginJobContext, ToolResult } from "@paperclipai/plugin-sdk";
import { randomUUID } from "crypto";
import { JOB_KEYS, KB_ENTITY_TYPE, TOOL_NAMES } from "./constants.js";

type KBEntryData = {
  description: string;
  type: string;
  tags: string[];
  accessCount: number;
  createdAt: string;
  lastAccessedAt?: string;
  updatedAt?: string;
  deprecatedAt?: string;
  deprecatedReason?: string;
  createdByAgentId?: string;
};

// Trigger patterns for auto-capture from comments (case-insensitive)
const TRIGGER_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /^(decision|decisi[oó]n)\s*:\s*/i, type: "decision" },
  { pattern: /^(til|learning|aprendizaje)\s*:\s*/i, type: "learning" },
  { pattern: /^(error|postmortem)\s*:\s*/i, type: "error" },
  { pattern: /^(context|contexto)\s*:\s*/i, type: "context" },
];

function extractTrigger(body: string): { type: string; text: string } | null {
  const trimmed = body.trim();
  for (const { pattern, type } of TRIGGER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { type, text: trimmed.slice(match[0].length).trim() };
    }
  }
  return null;
}

const DECAY_THRESHOLD_DAYS = 90;
const DECAY_ACCESS_THRESHOLD = 3;

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
        const p = params as {
          title?: string;
          description?: string;
          type?: string;
          tags?: string[];
          externalId?: string;
        };
        const title = (p.title ?? "").trim();
        const description = (p.description ?? "").trim();
        if (!title || !description) {
          return { content: "title and description are required.", data: { error: "missing_fields" } };
        }
        const now = new Date().toISOString();
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
            createdAt: now,
            lastAccessedAt: now,
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
        const desiredStatus = p.status ?? "active";
        const records = await ctx.entities.list({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          limit: 1000,
          offset: 0,
        });
        let filtered = records.filter((r) => (r.status ?? "active") === desiredStatus);
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
            return r.title?.toLowerCase().includes(q) || (d?.description ?? "").toLowerCase().includes(q);
          });
        }
        filtered = filtered.slice(0, limit);
        if (filtered.length === 0) {
          return { content: "No matching KB entries found.", data: [] };
        }
        // Track access for returned entries
        const now = new Date().toISOString();
        await Promise.all(
          filtered.map((r) => {
            const d = r.data as KBEntryData;
            return ctx.entities.upsert({
              entityType: KB_ENTITY_TYPE,
              scopeKind: "company",
              scopeId: r.scopeId ?? runCtx.companyId,
              externalId: r.externalId ?? r.id,
              title: r.title ?? undefined,
              status: r.status ?? undefined,
              data: { ...d, accessCount: (d.accessCount ?? 0) + 1, lastAccessedAt: now },
            });
          }),
        );
        const summary = filtered
          .map((r) => {
            const d = r.data as KBEntryData;
            return (
              "[" + r.id + "] **" + r.title + "** (" + (d?.type ?? "?") + ") — " + (d?.description ?? "").slice(0, 120)
            );
          })
          .join("\n");
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
        const records = await ctx.entities.list({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          limit: 1000,
          offset: 0,
        });
        const existing = records.find((r) => r.id === p.id);
        if (!existing) return { content: "KB entry " + p.id + " not found.", data: { error: "not_found" } };
        const d = existing.data as KBEntryData;
        const updated = await ctx.entities.upsert({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: existing.externalId ?? p.id,
          title: p.title ?? existing.title ?? undefined,
          status: existing.status ?? undefined,
          data: {
            ...d,
            ...(p.description ? { description: p.description } : {}),
            ...(p.type ? { type: p.type } : {}),
            ...(p.tags ? { tags: p.tags } : {}),
            updatedAt: new Date().toISOString(),
          },
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
        const records = await ctx.entities.list({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          limit: 1000,
          offset: 0,
        });
        const existing = records.find((r) => r.id === p.id);
        if (!existing) return { content: "KB entry " + p.id + " not found.", data: { error: "not_found" } };
        const d = existing.data as KBEntryData;
        const updated = await ctx.entities.upsert({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: existing.externalId ?? p.id,
          title: existing.title ?? undefined,
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
        limit: 1000,
        offset: 0,
      });
      const desiredStatus = typeof p.status === "string" ? p.status : "active";
      const maxLimit = Math.min(typeof p.limit === "number" ? p.limit : 50, 100);
      let filtered = records.filter((r) => (r.status ?? "active") === desiredStatus);
      if (typeof p.query === "string" && p.query.trim()) {
        const q = p.query.toLowerCase();
        filtered = filtered.filter((r) => {
          const d = r.data as KBEntryData;
          return r.title?.toLowerCase().includes(q) || (d?.description ?? "").toLowerCase().includes(q);
        });
      }
      return filtered.slice(0, maxLimit);
    });

    // --- Event: issue.updated → auto-capture on done ---
    ctx.events.on("issue.updated", async (event: PluginEvent) => {
      const payload = event.payload as Record<string, unknown>;
      if (payload.status !== "done") return;

      const issueId = event.entityId;
      if (!issueId) return;

      const companyId = event.companyId;

      // Deduplicate by issueId
      const existing = await ctx.entities.list({
        entityType: KB_ENTITY_TYPE,
        externalId: "issue-done-" + issueId,
        scopeKind: "company",
        scopeId: companyId,
      });
      if (existing.length > 0) {
        ctx.logger.debug("KB auto-capture: issue-done entry already exists, skipping", { issueId });
        return;
      }

      // Fetch the issue for title/description
      const issue = await ctx.issues.get(issueId, companyId);
      if (!issue) return;

      // Get last comment for context
      const comments = await ctx.issues.listComments(issueId, companyId);
      const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
      const description = [
        issue.description ?? "",
        lastComment ? "\n\n---\n**Final comment:** " + lastComment.body : "",
      ]
        .join("")
        .trim();

      const projectName = issue.projectId ?? null;
      const tags = ["auto-captured", "issue-resolution"];
      if (projectName) tags.push(projectName);

      const now = new Date().toISOString();
      await ctx.entities.upsert({
        entityType: KB_ENTITY_TYPE,
        scopeKind: "company",
        scopeId: companyId,
        externalId: "issue-done-" + issueId,
        title: issue.title,
        status: "active",
        data: {
          description: description || issue.title,
          type: "decision",
          tags,
          accessCount: 0,
          createdAt: now,
          lastAccessedAt: now,
        } satisfies KBEntryData,
      });
      ctx.logger.info("KB auto-capture: created issue-done entry", { issueId, title: issue.title });
    });

    // --- Event: issue.comment.created → auto-capture from trigger patterns ---
    ctx.events.on("issue.comment.created", async (event: PluginEvent) => {
      const payload = event.payload as Record<string, unknown>;
      const body =
        typeof payload.body === "string"
          ? payload.body
          : typeof payload.bodySnippet === "string"
            ? payload.bodySnippet
            : null;
      if (!body) return;

      const trigger = extractTrigger(body);
      if (!trigger) return;

      const companyId = event.companyId;
      const commentId = typeof payload.commentId === "string" ? payload.commentId : (event.entityId ?? randomUUID());
      const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
      const authorAgentId = typeof payload.authorAgentId === "string" ? payload.authorAgentId : null;

      // Deduplicate by commentId
      const existing = await ctx.entities.list({
        entityType: KB_ENTITY_TYPE,
        externalId: "comment-capture-" + commentId,
        scopeKind: "company",
        scopeId: companyId,
      });
      if (existing.length > 0) {
        ctx.logger.debug("KB auto-capture: comment entry already exists, skipping", { commentId });
        return;
      }

      // Fetch issue for title/project tagging
      const issue = issueId ? await ctx.issues.get(issueId, companyId) : null;
      const issueTitle = typeof payload.issueTitle === "string" ? payload.issueTitle : (issue?.title ?? null);
      const projectName = issue?.projectId ?? null;

      const tags = ["auto-captured"];
      if (issueTitle) tags.push(issueTitle);
      if (projectName) tags.push(projectName);

      const title = issueTitle ? issueTitle + " — " + trigger.type : trigger.type;
      const now = new Date().toISOString();
      await ctx.entities.upsert({
        entityType: KB_ENTITY_TYPE,
        scopeKind: "company",
        scopeId: companyId,
        externalId: "comment-capture-" + commentId,
        title,
        status: "active",
        data: {
          description: trigger.text,
          type: trigger.type,
          tags,
          accessCount: 0,
          createdAt: now,
          lastAccessedAt: now,
          ...(authorAgentId ? { createdByAgentId: authorAgentId } : {}),
        } satisfies KBEntryData,
      });
      ctx.logger.info("KB auto-capture: created comment-triggered entry", { commentId, type: trigger.type });
    });

    // --- Scheduled job: kb-decay ---
    ctx.jobs.register(JOB_KEYS.decay, async (_job: PluginJobContext) => {
      ctx.logger.info("KB decay job starting");

      // Collect all companies via entities scope — we use instance-level scan
      // by listing without scopeId (if supported) or rely on company-scoped entities.
      // Since entities are scoped per company, we scan known companies.
      const companies = await ctx.companies.list();
      let totalDecayed = 0;

      for (const company of companies) {
        const records = await ctx.entities.list({
          entityType: KB_ENTITY_TYPE,
          scopeKind: "company",
          scopeId: company.id,
          limit: 1000,
          offset: 0,
        });

        const activeRecords = records.filter((r) => (r.status ?? "active") === "active");
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - DECAY_THRESHOLD_DAYS);

        const toDecay = activeRecords.filter((r) => {
          const d = r.data as KBEntryData;
          if ((d.accessCount ?? 0) >= DECAY_ACCESS_THRESHOLD) return false;
          const lastAccessed = d.lastAccessedAt ?? d.createdAt;
          if (!lastAccessed) return false;
          return new Date(lastAccessed) < thresholdDate;
        });

        for (const r of toDecay) {
          const d = r.data as KBEntryData;
          await ctx.entities.upsert({
            entityType: KB_ENTITY_TYPE,
            scopeKind: "company",
            scopeId: company.id,
            externalId: r.externalId ?? r.id,
            title: r.title ?? undefined,
            status: "deprecated",
            data: {
              ...d,
              deprecatedAt: new Date().toISOString(),
              deprecatedReason: "auto-decay: low usage",
            },
          });
          totalDecayed++;
        }

        if (toDecay.length > 0) {
          ctx.logger.info("KB decay: deprecated entries for company", { companyId: company.id, count: toDecay.length });
        }
      }

      ctx.logger.info("KB decay job complete", { totalDecayed });
    });
  },

  async onHealth() {
    return { status: "ok", message: "Knowledge Base plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
