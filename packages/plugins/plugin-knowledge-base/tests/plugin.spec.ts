import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "company-test";

function makeCompany(id: string) {
  return {
    id,
    name: "Test Co",
    description: null,
    status: "active" as const,
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "TST",
    issueCounter: 0,
    budgetMonthlyCents: 10000,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: false,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function setupHarness() {
  const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe("knowledge-base plugin", () => {
  it("kb-write creates a new entry", async () => {
    const harness = await setupHarness();
    const result = await harness.executeTool(
      "kb-write",
      { title: "Test entry", description: "A test description" },
      { companyId: COMPANY_ID },
    );
    expect(result.data).toBeDefined();
    const rec = result.data as { title: string; status: string };
    expect(rec.title).toBe("Test entry");
    expect(rec.status).toBe("active");
  });

  it("kb-write returns error for missing fields", async () => {
    const harness = await setupHarness();
    const result = await harness.executeTool("kb-write", { title: "Only title" }, { companyId: COMPANY_ID });
    expect((result.data as { error: string }).error).toBe("missing_fields");
  });

  it("kb-read returns empty when no entries exist", async () => {
    const harness = await setupHarness();
    const result = await harness.executeTool("kb-read", {}, { companyId: COMPANY_ID });
    expect(result.content).toMatch(/No matching/);
    expect(result.data).toEqual([]);
  });

  it("kb-read finds entries matching a query", async () => {
    const harness = await setupHarness();
    await harness.executeTool(
      "kb-write",
      { title: "Searchable entry", description: "findme" },
      { companyId: COMPANY_ID },
    );
    const result = await harness.executeTool("kb-read", { query: "findme" }, { companyId: COMPANY_ID });
    const data = result.data as unknown[];
    expect(data.length).toBeGreaterThan(0);
  });

  it("kb-read filters by tags", async () => {
    const harness = await setupHarness();
    await harness.executeTool(
      "kb-write",
      { title: "Tagged entry", description: "Has tag", tags: ["beta"] },
      { companyId: COMPANY_ID },
    );
    await harness.executeTool(
      "kb-write",
      { title: "Untagged entry", description: "No tags", tags: [] },
      { companyId: COMPANY_ID },
    );
    const result = await harness.executeTool("kb-read", { tags: ["beta"] }, { companyId: COMPANY_ID });
    const data = result.data as Array<{ title: string }>;
    expect(data.length).toBe(1);
    expect(data[0].title).toBe("Tagged entry");
  });

  it("kb-update modifies an existing entry", async () => {
    const harness = await setupHarness();
    const writeResult = await harness.executeTool(
      "kb-write",
      { title: "Initial title", description: "Old desc" },
      { companyId: COMPANY_ID },
    );
    const id = (writeResult.data as { id: string }).id;
    const updateResult = await harness.executeTool(
      "kb-update",
      { id, description: "New desc" },
      { companyId: COMPANY_ID },
    );
    const updated = updateResult.data as { data: { description: string } };
    expect(updated.data.description).toBe("New desc");
  });

  it("kb-update returns not_found for unknown id", async () => {
    const harness = await setupHarness();
    const result = await harness.executeTool(
      "kb-update",
      { id: "nonexistent-id", description: "Anything" },
      { companyId: COMPANY_ID },
    );
    expect((result.data as { error: string }).error).toBe("not_found");
  });

  it("kb-deprecate marks an entry as deprecated", async () => {
    const harness = await setupHarness();
    const writeResult = await harness.executeTool(
      "kb-write",
      { title: "To deprecate", description: "Old info" },
      { companyId: COMPANY_ID },
    );
    const id = (writeResult.data as { id: string }).id;
    const deprecateResult = await harness.executeTool(
      "kb-deprecate",
      { id, reason: "Outdated" },
      { companyId: COMPANY_ID },
    );
    const deprecated = deprecateResult.data as { status: string; data: { deprecatedReason: string } };
    expect(deprecated.status).toBe("deprecated");
    expect(deprecated.data.deprecatedReason).toBe("Outdated");
  });

  it("kb-deprecate returns not_found for unknown id", async () => {
    const harness = await setupHarness();
    const result = await harness.executeTool("kb-deprecate", { id: "nonexistent-id" }, { companyId: COMPANY_ID });
    expect((result.data as { error: string }).error).toBe("not_found");
  });

  // --- Phase 2: event-driven auto-capture ---

  describe("issue.updated → auto-capture on done", () => {
    it("creates a KB entry when issue transitions to done", async () => {
      const harness = await setupHarness();
      const ISSUE_ID = "issue-abc-123";
      harness.seed({
        issues: [
          {
            id: ISSUE_ID,
            companyId: COMPANY_ID,
            title: "Ship the feature",
            description: "We need to ship by Friday",
            status: "done",
            projectId: "project-xyz",
            projectWorkspaceId: null,
            goalId: null,
            parentId: null,
            priority: "high",
            assigneeAgentId: null,
            assigneeUserId: null,
            checkoutRunId: null,
            executionRunId: null,
            executionAgentNameKey: null,
            executionLockedAt: null,
            createdByAgentId: null,
            createdByUserId: null,
            issueNumber: 42,
            identifier: "TST-42",
            requestDepth: 0,
            billingCode: null,
            assigneeAdapterOverrides: null,
            executionWorkspaceId: null,
            executionWorkspacePreference: null,
            executionWorkspaceSettings: null,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,
            hiddenAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await harness.emit(
        "issue.updated",
        { status: "done", identifier: "TST-42" },
        { entityId: ISSUE_ID, companyId: COMPANY_ID },
      );

      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
      const entry = entries[0] as { title: string; status: string; data: { type: string; tags: string[] } };
      expect(entry.title).toBe("Ship the feature");
      expect(entry.status).toBe("active");
      expect(entry.data.type).toBe("decision");
      expect(entry.data.tags).toContain("auto-captured");
      expect(entry.data.tags).toContain("issue-resolution");
    });

    it("does not create a duplicate entry for the same issue", async () => {
      const harness = await setupHarness();
      const ISSUE_ID = "issue-dedup-456";
      harness.seed({
        issues: [
          {
            id: ISSUE_ID,
            companyId: COMPANY_ID,
            title: "Dedup issue",
            description: "Some description",
            status: "done",
            projectId: null,
            projectWorkspaceId: null,
            goalId: null,
            parentId: null,
            priority: "medium",
            assigneeAgentId: null,
            assigneeUserId: null,
            checkoutRunId: null,
            executionRunId: null,
            executionAgentNameKey: null,
            executionLockedAt: null,
            createdByAgentId: null,
            createdByUserId: null,
            issueNumber: null,
            identifier: null,
            requestDepth: 0,
            billingCode: null,
            assigneeAdapterOverrides: null,
            executionWorkspaceId: null,
            executionWorkspacePreference: null,
            executionWorkspaceSettings: null,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,
            hiddenAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Emit the event twice
      await harness.emit("issue.updated", { status: "done" }, { entityId: ISSUE_ID, companyId: COMPANY_ID });
      await harness.emit("issue.updated", { status: "done" }, { entityId: ISSUE_ID, companyId: COMPANY_ID });

      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
    });

    it("ignores issue.updated events for non-done statuses", async () => {
      const harness = await setupHarness();
      await harness.emit(
        "issue.updated",
        { status: "in_progress" },
        { entityId: "issue-irrelevant", companyId: COMPANY_ID },
      );
      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(0);
    });
  });

  describe("issue.comment.created → trigger pattern capture", () => {
    it("captures a decision from a comment body", async () => {
      const harness = await setupHarness();
      const COMMENT_ID = "comment-decision-1";
      const ISSUE_ID = "issue-for-comment";
      harness.seed({
        issues: [
          {
            id: ISSUE_ID,
            companyId: COMPANY_ID,
            title: "Auth Redesign",
            description: null,
            status: "in_progress",
            projectId: "project-auth",
            projectWorkspaceId: null,
            goalId: null,
            parentId: null,
            priority: "high",
            assigneeAgentId: null,
            assigneeUserId: null,
            checkoutRunId: null,
            executionRunId: null,
            executionAgentNameKey: null,
            executionLockedAt: null,
            createdByAgentId: null,
            createdByUserId: null,
            issueNumber: null,
            identifier: "AUTH-1",
            requestDepth: 0,
            billingCode: null,
            assigneeAdapterOverrides: null,
            executionWorkspaceId: null,
            executionWorkspacePreference: null,
            executionWorkspaceSettings: null,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,
            hiddenAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      await harness.emit(
        "issue.comment.created",
        {
          commentId: COMMENT_ID,
          body: "Decision: We will use JWTs for auth tokens",
          issueId: ISSUE_ID,
          issueTitle: "Auth Redesign",
        },
        { entityId: COMMENT_ID, companyId: COMPANY_ID },
      );

      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
      const entry = entries[0] as { data: { type: string; description: string; tags: string[] } };
      expect(entry.data.type).toBe("decision");
      expect(entry.data.description).toBe("We will use JWTs for auth tokens");
      expect(entry.data.tags).toContain("auto-captured");
    });

    it("captures a TIL learning from a comment", async () => {
      const harness = await setupHarness();
      await harness.emit(
        "issue.comment.created",
        {
          commentId: "comment-til-1",
          body: "TIL: Node.js streams are way more efficient than loading files into memory",
          issueId: null,
        },
        { entityId: "comment-til-1", companyId: COMPANY_ID },
      );
      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
      const entry = entries[0] as { data: { type: string } };
      expect(entry.data.type).toBe("learning");
    });

    it("captures an error/postmortem trigger", async () => {
      const harness = await setupHarness();
      await harness.emit(
        "issue.comment.created",
        {
          commentId: "comment-postmortem-1",
          body: "Postmortem: DB was not indexed, causing full table scans",
          issueId: null,
        },
        { entityId: "comment-postmortem-1", companyId: COMPANY_ID },
      );
      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
      const entry = entries[0] as { data: { type: string } };
      expect(entry.data.type).toBe("error");
    });

    it("ignores comments without trigger patterns", async () => {
      const harness = await setupHarness();
      await harness.emit(
        "issue.comment.created",
        { commentId: "comment-no-trigger", body: "Just a regular update, nothing to capture here.", issueId: null },
        { entityId: "comment-no-trigger", companyId: COMPANY_ID },
      );
      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(0);
    });

    it("deduplicates comment captures by commentId", async () => {
      const harness = await setupHarness();
      const payload = { commentId: "comment-dedup-2", body: "TIL: Something interesting", issueId: null };
      await harness.emit("issue.comment.created", payload, { entityId: "comment-dedup-2", companyId: COMPANY_ID });
      await harness.emit("issue.comment.created", payload, { entityId: "comment-dedup-2", companyId: COMPANY_ID });
      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID });
      expect(entries.length).toBe(1);
    });
  });

  describe("kb-decay job", () => {
    it("deprecates old low-access entries", async () => {
      const harness = await setupHarness();
      // Seed a company so the decay job can find it
      harness.seed({ companies: [makeCompany(COMPANY_ID)] });

      // Create a stale entry (older than 90 days, 0 accesses)
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 95);
      // Write the entry manually via upsert to set old dates
      await harness.ctx.entities.upsert({
        entityType: "kb-entry",
        scopeKind: "company",
        scopeId: COMPANY_ID,
        externalId: "stale-entry-1",
        title: "Stale entry",
        status: "active",
        data: {
          description: "Old unused entry",
          type: "fact",
          tags: [],
          accessCount: 0,
          createdAt: staleDate.toISOString(),
          lastAccessedAt: staleDate.toISOString(),
        },
      });

      // Create a recent entry (should not be decayed)
      const recentDate = new Date();
      await harness.ctx.entities.upsert({
        entityType: "kb-entry",
        scopeKind: "company",
        scopeId: COMPANY_ID,
        externalId: "recent-entry-1",
        title: "Recent entry",
        status: "active",
        data: {
          description: "Recently accessed entry",
          type: "fact",
          tags: [],
          accessCount: 0,
          createdAt: recentDate.toISOString(),
          lastAccessedAt: recentDate.toISOString(),
        },
      });

      // Create a stale entry with high access count (should not be decayed)
      await harness.ctx.entities.upsert({
        entityType: "kb-entry",
        scopeKind: "company",
        scopeId: COMPANY_ID,
        externalId: "popular-stale-entry-1",
        title: "Popular but stale entry",
        status: "active",
        data: {
          description: "Much-accessed old entry",
          type: "fact",
          tags: [],
          accessCount: 5,
          createdAt: staleDate.toISOString(),
          lastAccessedAt: staleDate.toISOString(),
        },
      });

      await harness.runJob("kb-decay");

      // Check that only the truly stale low-access entry was deprecated
      const activeEntries = await harness.getData<Array<{ title: string; status: string }>>("kb-entries", {
        companyId: COMPANY_ID,
        status: "active",
      });
      const deprecatedEntries = await harness.getData<
        Array<{ title: string; status: string; data: { deprecatedReason: string } }>
      >("kb-entries", {
        companyId: COMPANY_ID,
        status: "deprecated",
      });

      const activeTitles = activeEntries.map((e) => e.title);
      expect(activeTitles).toContain("Recent entry");
      expect(activeTitles).toContain("Popular but stale entry");
      expect(activeTitles).not.toContain("Stale entry");

      expect(deprecatedEntries.length).toBe(1);
      expect(deprecatedEntries[0].title).toBe("Stale entry");
      expect(deprecatedEntries[0].data.deprecatedReason).toBe("auto-decay: low usage");
    });

    it("does not decay entries with sufficient access count", async () => {
      const harness = await setupHarness();
      harness.seed({ companies: [makeCompany(COMPANY_ID)] });

      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 95);

      await harness.ctx.entities.upsert({
        entityType: "kb-entry",
        scopeKind: "company",
        scopeId: COMPANY_ID,
        externalId: "accessed-stale",
        title: "Well-accessed stale entry",
        status: "active",
        data: {
          description: "Has enough accesses",
          type: "fact",
          tags: [],
          accessCount: 3,
          createdAt: staleDate.toISOString(),
          lastAccessedAt: staleDate.toISOString(),
        },
      });

      await harness.runJob("kb-decay");

      const entries = await harness.getData<unknown[]>("kb-entries", { companyId: COMPANY_ID, status: "active" });
      expect(entries.length).toBe(1);
    });
  });
});
