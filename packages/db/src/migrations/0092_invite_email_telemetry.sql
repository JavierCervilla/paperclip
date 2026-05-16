-- Add email send telemetry columns to invites (PAP-869).
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "send_error" text;
