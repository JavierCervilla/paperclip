import { describe, expect, it } from "vitest";
import { renderResetPasswordEmail } from "../templates/reset-password.js";

describe("renderResetPasswordEmail", () => {
  const baseInput = {
    recipientEmail: "recipient@example.com",
    resetUrl: "https://app.example.com/auth/reset-password?token=pcp_reset_abcd1234",
    expiresAt: new Date("2026-05-18T12:30:00.000Z"),
  };

  it("uses a fixed Paperclip reset subject", () => {
    const result = renderResetPasswordEmail(baseInput);
    expect(result.subject).toBe("Restablece tu contraseña de Paperclip");
  });

  it("includes the reset URL in both html and text", () => {
    const result = renderResetPasswordEmail(baseInput);
    expect(result.html).toContain(baseInput.resetUrl);
    expect(result.text).toContain(baseInput.resetUrl);
  });

  it("includes the recipient email so the reader can recognise the request", () => {
    const result = renderResetPasswordEmail(baseInput);
    expect(result.text).toContain("recipient@example.com");
    expect(result.html).toContain("recipient@example.com");
  });

  it("renders the expiry timestamp with minute precision", () => {
    const result = renderResetPasswordEmail(baseInput);
    expect(result.text).toContain("2026-05-18 12:30 UTC");
    expect(result.html).toContain("2026-05-18 12:30 UTC");
  });

  it("escapes HTML in the reset URL to prevent injection", () => {
    const result = renderResetPasswordEmail({
      ...baseInput,
      resetUrl: 'https://app.example.com/auth/reset-password?token="><script>x</script>',
    });
    expect(result.html).not.toContain("<script>x</script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("keeps a safe-to-ignore footer for unsolicited resets", () => {
    const result = renderResetPasswordEmail(baseInput);
    expect(result.text).toContain("puedes ignorar este correo");
    expect(result.html).toContain("puedes ignorar este correo");
  });
});
