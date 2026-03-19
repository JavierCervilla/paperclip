# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Paperclip?

Paperclip is an open-source orchestration platform for AI agents — a Node.js server + React UI that lets users create AI-powered "companies" with org charts, budgets, governance, and agent coordination. It supports multiple agent runtimes (Claude Code, Codex, Cursor, Gemini, OpenClaw, etc.).

## Monorepo Structure

**Package manager:** pnpm 9.15.4 (workspaces)

```
server/          # Express 5 REST API + WebSocket server (port 3100)
ui/              # React 19 SPA (Vite, TailwindCSS v4, Radix UI)
cli/             # npx paperclipai CLI (esbuild bundled)
packages/
  db/            # PostgreSQL schema + Drizzle ORM migrations
  shared/        # Shared TypeScript types (used by all packages)
  adapter-utils/ # Common utilities shared across adapters
  adapters/      # Per-runtime agent adapters (claude-local, codex-local, cursor-local, gemini-local, openclaw-gateway, opencode-local, pi-local)
  plugins/       # Plugin SDK + examples
```

## Commands

```bash
# Development
pnpm dev              # Full stack (API + UI, watch mode)
pnpm dev:server       # Server only
pnpm dev:ui           # UI only

# Build
pnpm build            # Build all packages

# Tests
pnpm test             # Vitest watch mode (all packages)
pnpm test:run         # Vitest CI mode (run once)
pnpm test:e2e         # Playwright e2e tests

# Single test file
pnpm vitest run server/src/__tests__/log-redaction.test.ts

# Type checking
pnpm typecheck

# Database
pnpm db:generate      # Generate Drizzle migrations (requires DATABASE_URL)
pnpm db:migrate       # Apply pending migrations
```

## Architecture

### Server (`server/`)

Express 5 app with these key areas:
- `src/routes/` — REST endpoints (agents, issues, approvals, costs, goals, projects, companies, plugins, etc.)
- `src/services/` — Business logic (heartbeat, budgets, workspace operations, plugin lifecycle, live events, etc.)
- `src/adapters/` — Per-runtime adapter wrappers loaded dynamically
- `src/realtime/` — WebSocket live event broadcasting
- `src/auth/` — better-auth authentication
- `src/middleware/` — Request validation, authz, logging

The server auto-migrates the database on startup and embeds a PostgreSQL instance locally (no manual DB setup needed for development). Data persists at `~/.paperclip/instances/default/db`.

### Database (`packages/db/`)

Drizzle ORM with PostgreSQL. Schema files live in `src/schema/`. Migrations are in `src/migrations/` and applied automatically at server startup. To regenerate after schema changes: build `db` package first, then `pnpm db:generate`.

### UI (`ui/`)

React 19 SPA with TanStack Query for data fetching, React Router 7 for routing, and `shadcn` components. Receives real-time updates via WebSocket from the server.

### Adapters (`packages/adapters/`)

Each adapter (e.g., `claude-local`) exports three surfaces:
- **server** — registers agent type, handles spawning/lifecycle
- **ui** — agent-specific UI components
- **cli** — adapter-specific CLI commands

### Plugin System (`packages/plugins/`)

Plugins run in sandboxed workers (`plugin-runtime-sandbox.ts`) managed by the server's plugin services. The Plugin SDK (`plugin-sdk`) provides the public API for plugin authors.

## Key Conventions

- All packages use TypeScript with strict project references (`tsconfig.json` root has `references` pointing to each workspace)
- The `packages/shared` package is the source of truth for types shared across server, UI, CLI, and adapters
- Vitest is configured via root `vitest.config.ts` with test projects for: `packages/db`, `packages/adapters/opencode-local`, `server`, `ui`, `cli`
- Environment variables: only `DATABASE_URL`, `PORT`, and `SERVE_UI` are needed; the embedded DB means `DATABASE_URL` is optional locally

## Environment

Copy `.env.example` to `.env` in `server/` if you need to point at an external PostgreSQL instance. Without it, the embedded database is used automatically.
