# Fork Contributor Guide

How to contribute to this Paperclip fork without creating merge conflicts during upstream syncs.

## The Golden Rule

> **Add new files. Don't edit upstream files.**

Every line you change in an upstream-owned file is a line that will conflict on the next sync. New files merge trivially — they simply appear. Edits to existing files require manual conflict resolution every single time.

## Branch Strategy

```
upstream/master → origin/master → preview (staging) → deploy/dokploy (production)
```

| Branch           | Purpose                    | Who commits                     |
| ---------------- | -------------------------- | ------------------------------- |
| `master`         | Read-only upstream mirror  | `sync-upstream.yml` only        |
| `preview`        | Staging + all feature work | Contributors via PR             |
| `deploy/dokploy` | Production                 | Validated merges from `preview` |

**All feature branches start from `preview` and PR back to `preview`.** Never branch from or PR to `master`.

## What Is Upstream-Owned vs. Fork-Owned

### Upstream-Owned (DO NOT EDIT)

These files come from `paperclipai/paperclip` and are overwritten on every sync:

- `server/` — All Express route handlers, orchestration, heartbeat logic
- `ui/src/` — All React components and pages
- `packages/db/` — Drizzle schema and migrations
- `packages/shared/` — Upstream shared types and validators (see exception below)
- `packages/adapters/` — Adapter implementations
- `cli/` — CLI tool source
- `CONTRIBUTING.md` — Upstream contributing guide

**If you need to change behavior in upstream files, the proper path is an upstream PR to `paperclipai/paperclip`.** That work is deferred for now (see the PAP-174 plan).

### Fork-Owned (SAFE TO EDIT)

These files exist only in our fork. Edit freely:

| Path                                   | Purpose                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `Dockerfile` (fork additions)          | Playwright deps, Deno, `gh` CLI, Gemini CLI, Plugin SDK build |
| `docker-compose*.yml` (fork additions) | Dokploy service naming, network config                        |
| `.github/workflows/sync-upstream.yml`  | Our upstream sync automation                                  |
| `.husky/` + lint-staged config         | Pre-commit hooks (fork addition)                              |
| `.eslintrc.*` / `.prettierrc.*`        | Linting config (fork addition)                                |
| `packages/shared/src/status-colors.ts` | Centralized chart colors and status labels                    |
| `packages/shared/src/type-guards.ts`   | Runtime type narrowing helpers                                |
| `packages/shared/src/errors.ts`        | Shared error helpers                                          |
| `packages/plugins/` (our plugins)      | Fork-specific plugins (Telegram, Sentry, etc.)                |
| `agents/`                              | Agent-specific config and instructions                        |
| `doc/` (fork-specific docs)            | This file, operational docs, plans                            |
| `CLAUDE.md`                            | Fork-specific agent/dev instructions                          |

## Safe Patterns for New Code

### Pattern 1: New Files in Existing Packages

The safest way to add functionality. Create a new `.ts` file in the appropriate package:

```
packages/shared/src/my-new-utility.ts   ← new file, zero conflict risk
```

Then import it where needed. If the consumer is also a new file, the conflict risk remains zero.

**Real example:** `packages/shared/src/status-colors.ts` centralizes UI color constants in a new file. The upstream components import it, but the file itself never conflicts because upstream doesn't know about it.

### Pattern 2: New Test Files

Tests belong in new files alongside or near the code they validate:

```
packages/plugins/telegram/__tests__/telegram.test.ts   ← new file
packages/shared/src/__tests__/type-guards.test.ts      ← new file
```

Never modify existing upstream test files. If upstream tests break after a sync, fix them in a dedicated sync-resolution PR, not mixed with feature work.

### Pattern 3: Wrapper Modules

When you need to extend upstream behavior, wrap it instead of modifying it:

```typescript
// packages/shared/src/fork-utils.ts  ← NEW file

import { upstreamFunction } from "./upstream-module";

export function enhancedFunction(args: Args) {
  // Add fork-specific behavior before/after
  const result = upstreamFunction(args);
  return enrichWithForkData(result);
}
```

Consumers in fork-owned code import from `fork-utils` instead of the upstream module directly.

### Pattern 4: Configuration Files

Config files (ESLint, Prettier, Husky, tsconfig extensions) merge cleanly because upstream either doesn't have them or has different filenames. Add new config files freely.

### Pattern 5: Dockerfile Additions

Our Dockerfile has fork-specific blocks (Playwright deps, Deno, `gh` CLI). When adding new system dependencies:

1. Add them in a clearly commented block
2. Keep fork additions grouped together, separate from upstream layers
3. Document what each addition is for

## What Creates Merge Conflicts (Avoid These)

| Action                               | Conflict Risk | Alternative                             |
| ------------------------------------ | ------------- | --------------------------------------- |
| Edit an upstream `.ts` file          | **High**      | Create a new file that wraps/extends it |
| Add imports to upstream files        | **Medium**    | Import in your new file instead         |
| Modify upstream test files           | **High**      | Write new test files                    |
| Change upstream package.json scripts | **Medium**    | Add new scripts with distinct names     |
| Edit Drizzle schema                  | **High**      | Wait for upstream sync, then migrate    |
| Reformat upstream code               | **Very High** | Never do this                           |

## The Upstream Sync Process

The `sync-upstream.yml` workflow runs weekly (Monday 08:00 UTC) or on manual trigger:

1. Fetches `upstream/master` from `paperclipai/paperclip`
2. Merges into `origin/master`
3. A human opens a PR from `master` → `preview`
4. Conflicts are resolved — **fork customizations always win**
5. After staging validation, `preview` merges to `deploy/dokploy`

### Resolving Sync Conflicts

When conflicts arise during upstream sync:

- **Dockerfile**: Keep our additions (Playwright, Deno, gh CLI blocks). Accept upstream changes to their own layers.
- **Repo references**: Keep `JavierCervilla/paperclip` where we've intentionally changed from `paperclipai/paperclip`.
- **docker-compose**: Keep our service naming to avoid Dokploy DNS collisions.
- **Everything else**: Accept upstream unless it breaks a fork feature. Test on `preview` before promoting.

## Key Customizations to Preserve

These exist in our fork but not upstream. During any sync, ensure these survive:

1. **Dockerfile extras**: Playwright system deps, Deno runtime, GitHub CLI, Gemini CLI, Plugin SDK build step
2. **Repo references**: `JavierCervilla/paperclip` where applicable
3. **Dokploy service naming**: DB service rename for DNS collision avoidance
4. **GH_TOKEN passthrough**: Environment variable for `gh` CLI authentication
5. **ESLint + Prettier config**: Fork-added linting infrastructure
6. **Pre-commit hooks**: Husky + lint-staged setup
7. **Shared utilities**: `status-colors.ts`, `type-guards.ts`, `errors.ts` in `packages/shared`

## Verification Before Submitting

Always run the full checklist:

```sh
pnpm -r typecheck   # Type-check all packages
pnpm test:run       # Run unit tests
pnpm build          # Build all packages
```

## Quick Decision Tree

```
Want to change behavior in server/ui/db code?
  ├─ Is it a bug fix or feature for upstream? → Open upstream PR (deferred)
  ├─ Is it fork-specific logic? → Create a NEW file that wraps/extends
  └─ Is it a config/tooling change? → Add new config files

Want to add a test?
  └─ Always create a NEW test file. Never edit upstream tests.

Want to add a dependency?
  ├─ Dev dependency (ESLint plugin, test util)? → Safe, add to root or package
  └─ Runtime dependency? → Discuss first, adds sync surface area

Want to change the Dockerfile?
  └─ Add in a clearly commented fork block. Keep upstream layers intact.
```

## Summary

The fork strategy is simple: **new files are free, edits are expensive.** Every new file you create is a file that will never conflict. Every upstream line you touch is a conflict you'll resolve forever. Write clean, self-contained modules. Leave the upstream campsite exactly as you found it — and build your improvements next door.
