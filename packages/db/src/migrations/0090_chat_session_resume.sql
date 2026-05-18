-- Add summary and resumed_from_session_id columns to chat_sessions to support
-- resuming a chat conversation from history (PAP-861).
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "summary" text;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "resumed_from_session_id" uuid;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_resumed_from_session_id_fk" FOREIGN KEY ("resumed_from_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_sessions_resumed_from_idx" ON "chat_sessions" USING btree ("resumed_from_session_id");
