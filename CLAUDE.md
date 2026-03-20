# CLAUDE.md

Configuration and conventions for agents working in this Paperclip fork.

## Branch Strategy

```
upstream/master → origin/master → preview (staging) → deploy/dokploy (production)
```

- **`master`** — Read-only upstream mirror. Synced via `sync-upstream.yml`. Never commit directly.
- **`preview`** — Staging/QA environment deployed on Dokploy. All feature work and upstream merges target this branch first via PR.
- **`deploy/dokploy`** — Production environment on Dokploy. Only receives validated merges from `preview`. Never push directly.

### PR Flow

1. Create a feature branch from `preview`.
2. Open a PR targeting `preview`.
3. Once validated on staging, `preview` is merged into `deploy/dokploy` for production.

### Upstream Sync Flow

1. `upstream/master` is fetched and merged into `origin/master`.
2. `origin/master` is merged into `preview` via PR, resolving conflicts.
3. After staging validation, `preview` merges into `deploy/dokploy`.

## Key Customizations (Preserve During Upstream Syncs)

These changes exist in `preview`/`deploy/dokploy` but not upstream. Conflicts during syncs must be resolved in favor of keeping these:

### Dockerfile

- **Playwright deps**: Extra system packages (`libglib2.0-0`, `libnss3`, `libatk1.0-0`, etc.) for headless browser support.
- **Deno runtime**: Installed via `deno.land/install.sh` for Deno-based adapters.
- **GitHub CLI (`gh`)**: Installed from GitHub's apt repo for PR/issue automation.
- **Gemini CLI**: `@google/gemini-cli` added to global npm installs.
- **Plugin SDK build**: `COPY packages/plugins/sdk/package.json` and `pnpm --filter @paperclipai/plugin-sdk build` added before UI/server builds.

### Other Customizations

- **Repo references**: Updated from `paperclipai/paperclip` to `JavierCervilla/paperclip` where applicable.
- **Dokploy service naming**: DB service renamed to avoid DNS collisions on `dokploy-network`.
- **GH_TOKEN env var**: Passed through for `gh` CLI authentication.

## Build & Test Commands

```sh
pnpm install          # Install dependencies
pnpm dev              # Start dev server (API + UI on :3100)
pnpm build            # Build all packages
pnpm -r typecheck     # Type-check all packages
pnpm test:run         # Run unit tests (vitest)
pnpm test:e2e         # Run Playwright e2e tests
pnpm db:generate      # Generate DB migrations after schema changes
pnpm db:migrate       # Run DB migrations
```

### Verification Checklist (before claiming done)

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

## Dev Environment

- **Embedded DB**: Leave `DATABASE_URL` unset to use PGlite in dev. Reset with `rm -rf data/pglite && pnpm dev`.
- **API**: `http://localhost:3100`
- **UI**: `http://localhost:3100` (served by API in dev)

## Repo Structure

- `server/` — Express REST API and orchestration
- `ui/` — React + Vite board UI
- `packages/db/` — Drizzle schema and migrations
- `packages/shared/` — Shared types, constants, validators
- `packages/plugins/sdk/` — Plugin SDK
- `packages/adapters/` — Agent adapters (claude-local, codex-local, gemini-local, etc.)
- `cli/` — CLI tool (`pnpm paperclipai`)
- `doc/` — Product and operational docs
- `agents/` — Agent-specific config and instructions

## Agent Working Directory

Agents run from `/paperclip/instances/default/projects/{companyId}/{projectId}/paperclip` inside the container. The home directory is `/paperclip`.

## Git Commit Convention

Always include `Co-Authored-By: Paperclip <noreply@paperclip.ing>` at the end of commit messages.
