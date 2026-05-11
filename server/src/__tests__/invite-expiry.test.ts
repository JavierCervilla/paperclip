import { describe, expect, it } from "vitest";
import { companyInviteExpiresAt } from "../routes/access.js";

describe("companyInviteExpiresAt", () => {
  it("sets invite expiration to 10 minutes after creation for agent invites", () => {
    const nowMs = Date.parse("2026-03-06T00:00:00.000Z");
    const expiresAt = companyInviteExpiresAt({ allowedJoinTypes: "agent", nowMs });
    expect(expiresAt.toISOString()).toBe("2026-03-06T00:10:00.000Z");
  });

  it("sets invite expiration to 10 minutes after creation for both invites", () => {
    const nowMs = Date.parse("2026-03-06T00:00:00.000Z");
    const expiresAt = companyInviteExpiresAt({ allowedJoinTypes: "both", nowMs });
    expect(expiresAt.toISOString()).toBe("2026-03-06T00:10:00.000Z");
  });

  it("sets invite expiration to 7 days after creation for human invites", () => {
    const nowMs = Date.parse("2026-03-06T00:00:00.000Z");
    const expiresAt = companyInviteExpiresAt({ allowedJoinTypes: "human", nowMs });
    expect(expiresAt.toISOString()).toBe("2026-03-13T00:00:00.000Z");
  });

  it("defaults to 10-minute TTL when no args supplied", () => {
    const before = Date.now();
    const expiresAt = companyInviteExpiresAt();
    const after = Date.now();
    const ttlMs = expiresAt.getTime() - before;
    const expectedTtl = 10 * 60 * 1000;
    expect(ttlMs).toBeGreaterThanOrEqual(expectedTtl);
    expect(ttlMs).toBeLessThanOrEqual(expectedTtl + (after - before) + 50);
  });
});
