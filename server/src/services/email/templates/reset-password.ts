import type { RenderedEmail } from "./invite.js";

export interface ResetPasswordEmailInput {
  recipientEmail: string;
  resetUrl: string;
  expiresAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpiresAt(date: Date): string {
  // Minute precision — reset links are short-lived (default 1h).
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function renderResetPasswordEmail(input: ResetPasswordEmailInput): RenderedEmail {
  const expiresOn = formatExpiresAt(input.expiresAt);
  const subject = "Restablece tu contraseña de Paperclip";

  const safeUrl = escapeHtml(input.resetUrl);
  const safeExpires = escapeHtml(expiresOn);
  const safeRecipient = escapeHtml(input.recipientEmail);

  const text = [
    "Restablece tu contraseña de Paperclip",
    "",
    `Se ha solicitado un restablecimiento de contraseña para ${input.recipientEmail}.`,
    `Abre este link para elegir una nueva contraseña (válido hasta ${expiresOn}):`,
    input.resetUrl,
    "",
    "Si no solicitaste este cambio puedes ignorar este correo — tu contraseña no cambiará.",
    "",
    "— Paperclip",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;">Paperclip</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:600;">Restablece tu contraseña</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                  Se ha solicitado un restablecimiento de contraseña para <strong>${safeRecipient}</strong>. Pulsa el botón para elegir una nueva contraseña. El link es válido hasta el <strong>${safeExpires}</strong>.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">Restablecer contraseña</a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
                  Si el botón no funciona, copia y pega esta URL en tu navegador:
                </p>
                <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;">${safeUrl}</a>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  Si no solicitaste este cambio puedes ignorar este correo — tu contraseña no cambiará.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
