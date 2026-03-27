import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "company-test";

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
});
