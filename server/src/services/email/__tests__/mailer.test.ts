import { describe, expect, it, vi } from "vitest";
import { createMailer, createNoopMailer, createResendMailer } from "../mailer.js";

describe("createMailer factory", () => {
  it("returns a Noop mailer when API key is missing", async () => {
    const mailer = createMailer({});
    expect(mailer.enabled).toBe(false);
    const result = await mailer.send({ to: "a@b.com", subject: "s", html: "h", text: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });

  it("returns a Noop mailer when from address is missing", async () => {
    const mailer = createMailer({ resendApiKey: "re_test" });
    expect(mailer.enabled).toBe(false);
  });

  it("returns a Resend mailer when both API key and from are present", () => {
    const mailer = createMailer({ resendApiKey: "re_test", resendFromEmail: "invites@example.com" });
    expect(mailer.enabled).toBe(true);
  });
});

describe("createResendMailer", () => {
  it("returns ok with the email id on success", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email_123" }, error: null });
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "Sender <invites@example.com>",
      replyTo: "reply@example.com",
      client: { emails: { send } as any },
    });

    const result = await mailer.send({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(result).toEqual({ ok: true, id: "email_123" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Sender <invites@example.com>",
        to: "user@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
        replyTo: "reply@example.com",
      }),
    );
  });

  it("returns an error result when the SDK reports a Resend error", async () => {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "invalid_from_address", message: "Domain not verified" },
    });
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "invites@example.com",
      client: { emails: { send } as any },
    });

    const result = await mailer.send({ to: "user@example.com", subject: "s", html: "h", text: "t" });

    expect(result).toEqual({ ok: false, error: "Domain not verified", code: "invalid_from_address" });
  });

  it("returns a send_exception when the SDK throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("network down"));
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "invites@example.com",
      client: { emails: { send } as any },
    });

    const result = await mailer.send({ to: "user@example.com", subject: "s", html: "h", text: "t" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("send_exception");
      expect(result.error).toBe("network down");
    }
  });
});

describe("createNoopMailer", () => {
  it("never sends and reports not_configured", async () => {
    const mailer = createNoopMailer();
    expect(mailer.enabled).toBe(false);
    const result = await mailer.send({ to: "x@y.com", subject: "s", html: "h", text: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_configured");
  });
});
