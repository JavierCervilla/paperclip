# Contributing Guide

Thanks for wanting to contribute!

We really appreciate both small fixes and thoughtful larger changes.

## Getting Started

1. Fork the repo and clone your fork
2. Install dependencies: `pnpm install`
3. Start the dev server: `pnpm dev` (API + UI on `:3100`)
4. Make your changes on a feature branch
5. Run the verification checklist before submitting

### Verification Checklist

Before opening a PR, make sure all three pass:

```sh
pnpm -r typecheck   # Type-check all packages
pnpm test:run       # Run unit tests
pnpm build          # Build all packages
```

## Two Paths to Get Your Pull Request Accepted

### Path 1: Small, Focused Changes (Fastest way to get merged)

- Pick **one** clear thing to fix/improve
- Touch the **smallest possible number of files**
- Make sure the change is very targeted and easy to review
- All automated checks pass (including Greptile comments)
- No new lint/test failures

These almost always get merged quickly when they're clean.

### Path 2: Bigger or Impactful Changes

- **First** talk about it in Discord → #dev channel
  → Describe what you're trying to solve
  → Share rough ideas / approach
- Once there's rough agreement, build it
- In your PR include:
  - Before / After screenshots (or short video if UI/behavior change)
  - Clear description of what & why
  - Proof it works (manual testing notes)
  - All tests passing
  - All Greptile + other PR comments addressed

PRs that follow this path are **much** more likely to be accepted, even when they're large.

## Coding Standards

- **TypeScript** for all server and UI code. No `any` unless unavoidable (and commented why).
- **Formatting**: Follow the existing code style. Use the project's ESLint and Prettier config.
- **Imports**: Use path aliases where defined. Keep imports organized (external, then internal, then relative).
- **Naming**: `camelCase` for variables and functions, `PascalCase` for types/components, `UPPER_SNAKE` for constants.
- **Tests**: Add tests for new logic. Don't skip existing tests. Use Vitest for unit tests, Playwright for e2e.
- **Database changes**: Run `pnpm db:generate` after modifying the Drizzle schema. Include the generated migration in your PR.
- **No secrets**: Never commit `.env` files, API keys, or credentials.

## General Rules (both paths)

- Write clear commit messages
- Keep PR title + description meaningful
- One PR = one logical change (unless it's a small related group)
- Run tests locally first
- Be kind in discussions

## Writing a Good PR message

Please include a "thinking path" at the top of your PR message that explains from the top of the project down to what you fixed. E.g.:

### Thinking Path Example 1:

> - Paperclip orchestrates ai-agents for zero-human companies
> - There are many types of adapters for each LLM model provider
> - But LLM's have a context limit and not all agents can automatically compact their context
> - So we need to have an adapter-specific configuration for which adapters can and cannot automatically compact their context
> - This pull request adds per-adapter configuration of compaction, either auto or paperclip managed
> - That way we can get optimal performance from any adapter/provider in Paperclip

### Thinking Path Example 2:

> - Paperclip orchestrates ai-agents for zero-human companies
> - But humans want to watch the agents and oversee their work
> - Human users also operate in teams and so they need their own logins, profiles, views etc.
> - So we have a multi-user system for humans
> - But humans want to be able to update their own profile picture and avatar
> - But the avatar upload form wasn't saving the avatar to the file storage system
> - So this PR fixes the avatar upload form to use the file storage service
> - The benefit is we don't have a one-off file storage for just one aspect of the system, which would cause confusion and extra configuration

Then have the rest of your normal PR message after the Thinking Path.

This should include details about what you did, why you did it, why it matters & the benefits, how we can verify it works, and any risks.

Please include screenshots if possible if you have a visible change. (use something like the [agent-browser skill](https://github.com/vercel-labs/agent-browser/blob/main/skills/agent-browser/SKILL.md) or similar to take screenshots). Ideally, you include before and after screenshots.

## Issue Labels

We use labels to categorize and prioritize issues:

| Label | Description |
|-------|-------------|
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `documentation` | Documentation only changes |
| `good first issue` | Good for newcomers to the project |
| `help wanted` | Extra attention needed from the community |
| `triage` | Needs review and categorization |
| `duplicate` | Already reported |
| `wontfix` | Not planned |
| `breaking` | Introduces a breaking change |
| `security` | Security-related issue |
| `performance` | Performance improvement |
| `ui` | Frontend / UI issue |
| `api` | Backend / API issue |
| `adapters` | Agent adapter related |
| `plugins` | Plugin system related |
| `infra` | CI/CD, deployment, infrastructure |

## Review Process

1. **Automated checks** run on every PR (typecheck, tests, build, Greptile review).
2. **Triage**: Maintainers label and prioritize incoming issues and PRs within 3 business days.
3. **Code review**: A maintainer will review your PR. Expect initial feedback within 5 business days for small PRs, 10 business days for larger ones.
4. **Iteration**: Address review comments, push updates, and re-request review.
5. **Merge**: Once approved and all checks pass, a maintainer will merge your PR.

### Response SLAs

| Action | Target |
|--------|--------|
| Issue triage (label + priority) | 3 business days |
| First review on small PRs (< 200 lines) | 5 business days |
| First review on large PRs (200+ lines) | 10 business days |
| Follow-up review after changes | 3 business days |

These are targets, not guarantees. We're a small team and prioritize quality over speed.

## Contributor License Agreement (CLA)

By submitting a pull request, you agree that your contributions are licensed under the same license as the project (see [LICENSE](./LICENSE)). You certify that:

- The contribution is your original work, or you have the right to submit it.
- You grant the project maintainers a perpetual, worldwide, non-exclusive, royalty-free license to use, reproduce, and distribute your contribution.
- You understand the contribution is public and a record of it (including your name and email) is maintained indefinitely.

No separate CLA form is required — submitting a PR constitutes acceptance.

## Questions?

Just ask in #dev — we're happy to help.

Happy hacking!
