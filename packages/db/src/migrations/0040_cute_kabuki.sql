ALTER TABLE "agents" ADD COLUMN "workspace_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
