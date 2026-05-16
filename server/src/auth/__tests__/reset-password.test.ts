import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { Mailer, SendMailInput } from "../../services/email/mailer.js";
import {
  RESET_PASSWORD_TOKEN_TTL_SECONDS,
  createRequestPasswordResetGuard,
  createSendResetPassword,
} from "../reset-password.js";

function mockResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("createRequestPasswordResetGuard", () => {
  it("rejects with 503 email_not_configured when the mailer is disabled", () => {
    const guard = createRequestPasswordResetGuard({ enabled: false } as Mailer);
    const res = mockResponse();
    const next = vi.fn();

    guard({} as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: { code: "email_not_configured", message: "Email service not configured" },
    });
  });

  it("passes the request through when the mailer is enabled", () => {
    const guard = createRequestPasswordResetGuard({ enabled: true } as Mailer);
    const res = mockResponse();
    const next = vi.fn();

    guard({} as Request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });
});

describe("createSendResetPassword", () => {
  function fakeMailer(result: Awaited<ReturnType<Mailer["send"]>>) {
    const sent: SendMailInput[] = [];
    const mailer: Mailer = {
      enabled: true,
      async send(input) {
        sent.push(input);
        return result;
      },
    };
    return { mailer, sent };
  }

  it("renders and sends the reset email with the reset url and a kind tag", async () => {
    const { mailer, sent } = fakeMailer({ ok: true, id: "email_1" });
    const now = () => new Date("2026-05-16T10:00:00.000Z");
    const send = createSendResetPassword(mailer, now);

    await send({
      user: { email: "user@example.com" },
      url: "https://app.example.com/api/auth/reset-password/tok_123?callbackURL=x",
      token: "tok_123",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("user@example.com");
    expect(sent[0].html).toContain("reset-password/tok_123");
    expect(sent[0].text).toContain("reset-password/tok_123");
    expect(sent[0].tags).toEqual([{ name: "kind", value: "reset_password" }]);
    // Expiry shown in the email tracks Better Auth's token TTL.
    const expectedExpiry = new Date(now().getTime() + RESET_PASSWORD_TOKEN_TTL_SECONDS * 1000);
    expect(sent[0].text).toContain(expectedExpiry.toISOString().slice(0, 16).replace("T", " "));
  });

  it("throws when the mailer reports a failure so it is not silently dropped", async () => {
    const { mailer } = fakeMailer({ ok: false, error: "Domain not verified", code: "invalid_from" });
    const send = createSendResetPassword(mailer);

    await expect(
      send({
        user: { email: "user@example.com" },
        url: "https://app.example.com/api/auth/reset-password/tok_123?callbackURL=x",
        token: "tok_123",
      }),
    ).rejects.toThrow("Domain not verified");
  });
});
