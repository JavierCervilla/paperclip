# Safety Conventions for Agentic Work

These conventions govern how agents handle destructive operations, file system mutations, and sandboxed environments. All agents working in Paperclip MUST follow these rules.

---

## 1. Dry-Run First Principle

Before executing any CLI command that mutates shared state, **prefer a dry-run or preview pass** when the tool supports it.

**When to dry-run:**

- Database migrations (`pnpm db:migrate` → inspect generated SQL first)
- Package installs with side-effects (`npm install --dry-run`)
- Deployments or release scripts that offer a preview mode
- Any command that deletes, overwrites, or irreversibly transforms data

**How to dry-run:**

Check the tool's help output for flags like `--dry-run`, `--preview`, `--check`, or `-n`. If the command has no dry-run mode, run the command against a non-production target (e.g., a staging environment or local DB) before running against production.

**Rule:** If a command cannot be previewed or reversed, post a comment to the issue describing the exact command and expected effect, set the issue to `blocked`, and wait for board or manager approval before executing.

---

## 2. Git Safety Rules

### Force-push is forbidden without explicit board approval

Never run:

```sh
git push --force
git push --force-with-lease   # also forbidden without approval
```

Force-pushing rewrites shared history and can destroy teammates' work. If you believe a force-push is truly required, post a comment describing why, set the issue to `blocked`, and wait for explicit board confirmation before proceeding.

### Hard-reset requires confirmation

Never run these without a comment + explicit approval:

```sh
git reset --hard
git checkout -- .
git restore .
git clean -f
git clean -fd
```

These discard local changes permanently. Before running, confirm that the working tree contains no unrecorded work (check `git status` and `git stash list`). Post your intent as a comment on the issue and wait for a reply if the state is ambiguous.

### Safe alternatives to prefer

| Dangerous                 | Safer alternative                                  |
| ------------------------- | -------------------------------------------------- |
| `git reset --hard HEAD~1` | `git revert HEAD` (creates undo commit)            |
| `git push --force`        | Fix the branch structure without rewriting history |
| `git clean -fd`           | `git clean -n` first to preview, then proceed      |

### Commit hygiene

- Never skip pre-commit hooks (`--no-verify`).
- Always include `Co-Authored-By: Paperclip <noreply@paperclip.ing>` in commit messages.
- Never amend published commits (i.e., commits already pushed to remote).

---

## 3. File System Safety

### No recursive deletes without confirmation

Never run:

```sh
rm -rf <path>
rm -r <path>
```

without first:

1. Verifying the path is what you intend (run `ls <path>` or `echo <path>` first).
2. Confirming there is no untracked or unrecorded work in that directory.
3. Posting your intent to the issue and receiving explicit acknowledgement when the delete affects shared or persistent data.

**Exceptions:** Deleting build artifacts (`dist/`, `node_modules/`, `.next/`) or explicitly listed temp directories is safe and does not require approval, provided you confirm the path is correct before running.

### Overwriting files

Prefer creating a backup or using version control before overwriting files that cannot be recovered from git history (e.g., data files outside the repo, log archives, DB snapshots).

### Symlinks and path traversal

Never create symlinks that escape the project root or point to system paths (`/etc`, `/var`, `/proc`). Validate any path constructed from user input or external data before using it in file operations.

---

## 4. Sandbox Awareness (Docker)

Agents running inside Docker containers have a partially isolated environment. Understanding what IS and IS NOT isolated prevents accidental side effects.

### What IS isolated (safe to mutate freely)

| Resource                           | Notes                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Container file system              | Changes are scoped to the container; they do not persist across container restarts unless written to a mounted volume |
| In-memory state                    | Process memory, env vars, open file descriptors                                                                       |
| Localhost ports (within container) | Ports opened inside the container are not exposed to the host unless mapped in `docker-compose.yml`                   |
| PGlite embedded DB (dev)           | Lives in `data/pglite/` inside the container; reset by deleting that directory                                        |

### What is NOT isolated (can affect the host or shared systems)

| Resource                               | Risk                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mounted volumes (`-v` bind mounts)     | Writes to mounted paths affect the host file system directly                                           |
| Shared DB service on `dokploy-network` | The production Postgres instance is shared; destructive queries affect all users                       |
| GitHub API calls (`gh` CLI)            | PR comments, merges, and pushes are permanent and visible to all                                       |
| External HTTP calls                    | Any outbound API call (LLM providers, webhooks, notification services) executes against real endpoints |
| Environment secrets                    | API keys and tokens injected via env vars are live credentials; treat them as production secrets       |

### Container restart behavior

When the container restarts, the file system resets to the image state **except for bind-mounted directories**. Do not rely on in-container state surviving a restart unless it is written to:

- A mounted volume path
- An external DB
- A committed git change

---

## 5. Approval Escalation Path

When any of the above rules require approval before proceeding:

1. Post a comment on the issue describing the exact action you want to take and why.
2. Set the issue status to `blocked`.
3. @-mention your manager (check `chainOfCommand`) or the board user who created the task.
4. Wait for an explicit reply approving the action before continuing.

Do not interpret silence as approval. Do not retry the blocked comment on subsequent heartbeats unless new context has been added (see the blocked-task dedup rule in the Paperclip skill).

---

## See Also

- `skills/paperclip/references/api-reference.md` — Paperclip API reference and heartbeat rules
- `skills/paperclip/references/verifier-workflow.md` — QA verification and fix-forward process
- Root `AGENTS.md` §6 — Code Execution Standards
