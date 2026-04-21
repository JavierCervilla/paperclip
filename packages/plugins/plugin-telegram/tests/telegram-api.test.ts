import { describe, expect, it } from "vitest";
import { escapeMarkdownV2, truncateAtWord } from "../src/telegram-api.js";

describe("escapeMarkdownV2", () => {
  it("escapes all MarkdownV2 special characters", () => {
    const input = "Hello_world*bold[link](url)~strike`code>quote#+-.=|{brace}!end\\back";
    const result = escapeMarkdownV2(input);

    expect(result).toContain("\\_");
    expect(result).toContain("\\*");
    expect(result).toContain("\\[");
    expect(result).toContain("\\]");
    expect(result).toContain("\\(");
    expect(result).toContain("\\)");
    expect(result).toContain("\\~");
    expect(result).toContain("\\`");
    expect(result).toContain("\\>");
    expect(result).toContain("\\#");
    expect(result).toContain("\\+");
    expect(result).toContain("\\-");
    expect(result).toContain("\\.");
    expect(result).toContain("\\=");
    expect(result).toContain("\\|");
    expect(result).toContain("\\{");
    expect(result).toContain("\\}");
    expect(result).toContain("\\!");
    expect(result).toContain("\\\\");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeMarkdownV2("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });

  it("escapes consecutive special characters", () => {
    expect(escapeMarkdownV2("**bold**")).toBe("\\*\\*bold\\*\\*");
  });
});

describe("truncateAtWord", () => {
  it("returns text unchanged when within limit", () => {
    const text = "short text";
    expect(truncateAtWord(text, 100)).toBe("short text");
  });

  it("returns text unchanged when exactly at limit", () => {
    const text = "exact";
    expect(truncateAtWord(text, 5)).toBe("exact");
  });

  it("truncates at word boundary and appends ellipsis", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const result = truncateAtWord(text, 20);

    expect(result.endsWith("...")).toBe(true);
    // Truncates at last space within first 20 chars, then appends "..."
    expect(result).toBe("the quick brown fox...");
  });

  it("truncates at maxLen when no suitable word boundary exists", () => {
    const text = "superlongwordwithoutanyspaces at all";
    const result = truncateAtWord(text, 10);

    // "at all" space is at index 30 which is past maxLen*0.7=7
    // The word boundary at position 30 is > maxLen, so lastIndexOf(" ") on the
    // truncated slice "superlongw" returns -1, which is < 7 — falls back to maxLen
    expect(result).toBe("superlongw...");
  });

  it("handles single-word text longer than limit", () => {
    const text = "abcdefghijklmnop";
    const result = truncateAtWord(text, 5);

    expect(result).toBe("abcde...");
  });
});
