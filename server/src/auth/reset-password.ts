import type { RequestHandler } from "express";
import type { Mailer } from "../services/email/mailer.js";
import { renderResetPasswordEmail } from "../services/email/templates/reset-password.js";

/**
 * Reset-password token lifetime. Mirrors Better Auth's default
 * (`emailAndPassword.resetPasswordTokenExpiresIn`, 3600s) so the expiry shown
 * in the email matches when the token actually stops working.
 */
export const RESET_PASSWORD_TOKEN_TTL_SECONDS = 3600;

type SendResetPasswordArgs = {
  user: { email: string };
  url: string;
  token: string;
};

/**
 * Builds the Better Auth `emailAndPassword.sendResetPassword` callback.
 *
 * The callback renders the reset email and sends it through the shared mailer.
 * A failed send throws so the failure surfaces in logs/observability instead of
 * being silently dropped — the public endpoint still returns a generic response
 * to preserve email-enumeration protection.
 */
export function createSendResetPassword(
  mailer: Mailer,
  now: () => Date = () => new Date(),
): (args: SendResetPasswordArgs) => Promise<void> {
  return async ({ user, url }) => {
    const rendered = renderResetPasswordEmail({
      recipientEmail: user.email,
      resetUrl: url,
      expiresAt: new Date(now().getTime() + RESET_PASSWORD_TOKEN_TTL_SECONDS * 1000),
    });
    const result = await mailer.send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [{ name: "kind", value: "reset_password" }],
    });
    if (!result.ok) {
      throw new Error(`Failed to send password reset email: ${result.error}`);
    }
  };
}

/**
 * Express guard for `POST /api/auth/request-password-reset`.
 *
 * Better Auth returns a generic 200 from this endpoint even when the email
 * could not be delivered (deliberate, to avoid leaking which emails exist).
 * That hides a misconfigured instance from operators. This guard runs *before*
 * the Better Auth handler and rejects the request with a clear error when no
 * email provider is configured at all. It is instance-global (not per-email),
 * so it does not weaken email-enumeration protection.
 */
export function createRequestPasswordResetGuard(mailer: Mailer): RequestHandler {
  return (_req, res, next) => {
    if (!mailer.enabled) {
      res.status(503).json({
        error: {
          code: "email_not_configured",
          message: "Email service not configured",
        },
      });
      return;
    }
    next();
  };
}
