import { describe, expect, it } from "vitest";
import { renderNote } from "../src/lib/vault-writer.js";
import type { ObsidianNote } from "../src/lib/mapper.js";

describe("renderNote", () => {
  it("renders frontmatter and body", () => {
    const note: ObsidianNote = {
      relativePath: "Issues/PAP-42.md",
      frontmatter: {
        paperclip_id: "iss_1",
        status: "in_progress",
        tags: ["paperclip", "issue"],
      },
      body: "# Fix login bug\n\nDescription here.\n",
    };

    const rendered = renderNote(note);
    expect(rendered).toContain("---");
    expect(rendered).toContain("paperclip_id: iss_1");
    expect(rendered).toContain("status: in_progress");
    expect(rendered).toContain('  - "paperclip"');
    expect(rendered).toContain('  - "issue"');
    expect(rendered).toContain("# Fix login bug");
  });

  it("handles null values", () => {
    const note: ObsidianNote = {
      relativePath: "test.md",
      frontmatter: { key: null },
      body: "Body",
    };

    const rendered = renderNote(note);
    expect(rendered).toContain("key: null");
  });

  it("handles empty arrays", () => {
    const note: ObsidianNote = {
      relativePath: "test.md",
      frontmatter: { items: [] },
      body: "Body",
    };

    const rendered = renderNote(note);
    expect(rendered).toContain("items: []");
  });

  it("quotes strings with special YAML characters", () => {
    const note: ObsidianNote = {
      relativePath: "test.md",
      frontmatter: { title: "Fix: something broken" },
      body: "Body",
    };

    const rendered = renderNote(note);
    expect(rendered).toContain('"Fix: something broken"');
  });
});
