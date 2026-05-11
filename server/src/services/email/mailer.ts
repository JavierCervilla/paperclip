import { Resend } from "resend";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Array<{ name: string; value: string }>;
}

export type SendMailResult = { ok: true; id?: string } | { ok: false; error: string; code?: string };

export interface Mailer {
  readonly enabled: boolean;
  send(input: SendMailInput): Promise<SendMailResult>;
}

export interface MailerConfig {
  resendApiKey?: string;
  resendFromEmail?: string;
  resendReplyTo?: string;
}

export function createNoopMailer(): Mailer {
  return {
    enabled: false,
    async send() {
      return { ok: false, error: "Email provider is not configured", code: "not_configured" };
    },
  };
}

export function createResendMailer(opts: {
  apiKey: string;
  from: string;
  replyTo?: string;
  client?: Pick<Resend, "emails">;
}): Mailer {
  const client = opts.client ?? new Resend(opts.apiKey);
  return {
    enabled: true,
    async send(input) {
      try {
        const response = await client.emails.send({
          from: opts.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          replyTo: opts.replyTo,
          tags: input.tags,
        });
        if (response.error) {
          return { ok: false, error: response.error.message, code: response.error.name };
        }
        return { ok: true, id: response.data?.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown email send error";
        return { ok: false, error: message, code: "send_exception" };
      }
    },
  };
}

export function createMailer(config: MailerConfig): Mailer {
  if (!config.resendApiKey || !config.resendFromEmail) {
    return createNoopMailer();
  }
  return createResendMailer({
    apiKey: config.resendApiKey,
    from: config.resendFromEmail,
    replyTo: config.resendReplyTo,
  });
}
