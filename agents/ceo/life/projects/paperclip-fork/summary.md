# Paperclip Fork

This workspace is a **fork** of `paperclipai/paperclip` (upstream). We do not publish npm releases — that's upstream's responsibility.

## Branch Strategy & Deploy Flow

```
upstream/master ──sync (weekly)──> origin/master (read-only mirror)
                                        │
                                   merge/cherry-pick
                                        │
                                        ▼
                               origin/preview (Dokploy staging)
                                        │
                                   merge (validated)
                                        │
                                        ▼
                            origin/deploy/dokploy (Dokploy production)
```

- **`master`** — synced from upstream every Monday via `sync-upstream.yml`. Not touched directly.
- **`preview`** — staging environment in Dokploy. Changes go here first for validation.
- **`deploy/dokploy`** — production environment in Dokploy. Only receives validated merges from `preview`.

## Dokploy Setup

- Two environments configured in Dokploy: **preview** (→ `preview` branch) and **production** (→ `deploy/dokploy` branch).
- Dokploy auto-deploys on push via webhook.
- Uses `deploy/docker-compose.dokploy.yml` which builds from repo `Dockerfile`.

## CI/CD (as of 2026-03-19)

- `sync-upstream.yml` — weekly upstream sync (relevant to this fork)
- `release.yml` — canary/stable npm releases (upstream only, not used here)
- `pr-verify.yml` / `pr-policy.yml` — PR checks against master
- No CI workflow yet for `preview` or `deploy/dokploy` branches
