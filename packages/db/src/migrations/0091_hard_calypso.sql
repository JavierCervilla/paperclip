-- Add recipient_email column to invites for human invite links (PAP-865).
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "recipient_email" text;
