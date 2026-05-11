import { describe, expect, it } from "vitest";
import { renderInviteEmail } from "../templates/invite.js";

describe("renderInviteEmail", () => {
  const baseInput = {
    companyName: "Acme",
    inviteUrl: "https://app.example.com/invite/pcp_invite_abcd1234",
    recipientEmail: "recipient@example.com",
    expiresAt: new Date("2026-05-18T12:00:00.000Z"),
  };

  it("includes the company name in the subject and headline", () => {
    const result = renderInviteEmail({ ...baseInput, inviterName: "Javier" });
    expect(result.subject).toBe("Acme: invitación para unirte");
    expect(result.text).toContain("Javier te ha invitado a unirte a Acme");
    expect(result.html).toContain("Javier te ha invitado a unirte a Acme");
  });

  it("falls back to a generic headline when no inviter name is provided", () => {
    const result = renderInviteEmail(baseInput);
    expect(result.text).toContain("Te han invitado a unirte a Acme");
  });

  it("falls back to 'Paperclip' when companyName is null", () => {
    const result = renderInviteEmail({ ...baseInput, companyName: null });
    expect(result.subject).toBe("Paperclip: invitación para unirte");
    expect(result.text).toContain("— Paperclip");
  });

  it("includes the invite URL in both html and text", () => {
    const result = renderInviteEmail(baseInput);
    expect(result.html).toContain(baseInput.inviteUrl);
    expect(result.text).toContain(baseInput.inviteUrl);
  });

  it("escapes HTML in company names to prevent injection", () => {
    const result = renderInviteEmail({ ...baseInput, companyName: "<script>x</script>" });
    expect(result.html).not.toContain("<script>x</script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("includes the expiry date as YYYY-MM-DD", () => {
    const result = renderInviteEmail(baseInput);
    expect(result.text).toContain("2026-05-18");
    expect(result.html).toContain("2026-05-18");
  });
});
