export interface InviteEmailInput {
  companyName: string | null;
  inviteUrl: string;
  inviterName?: string | null;
  recipientEmail: string;
  expiresAt: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
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
  return date.toISOString().slice(0, 10);
}

export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const companyLabel = input.companyName?.trim() || "Paperclip";
  const inviter = input.inviterName?.trim();
  const expiresOn = formatExpiresAt(input.expiresAt);

  const subject = `${companyLabel}: invitación para unirte`;
  const headline = inviter
    ? `${inviter} te ha invitado a unirte a ${companyLabel}`
    : `Te han invitado a unirte a ${companyLabel}`;

  const safeUrl = escapeHtml(input.inviteUrl);
  const safeCompany = escapeHtml(companyLabel);
  const safeHeadline = escapeHtml(headline);

  const text = [
    headline,
    "",
    `Acepta la invitación abriendo este link (válido hasta ${expiresOn}):`,
    input.inviteUrl,
    "",
    "Si no esperabas este correo puedes ignorarlo — el link caducará automáticamente.",
    "",
    `— ${companyLabel}`,
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
                <p style="margin:0 0 8px;font-size:14px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;">${safeCompany}</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:600;">${safeHeadline}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                  Pulsa el botón para aceptar la invitación. El link es válido hasta el <strong>${escapeHtml(expiresOn)}</strong>.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;">Aceptar invitación</a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
                  Si el botón no funciona, copia y pega esta URL en tu navegador:
                </p>
                <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;">${safeUrl}</a>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  Si no esperabas este correo puedes ignorarlo — el link caducará automáticamente.
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
