# Vendor: addyosmani/agent-skills

This directory is a **pinned, vendored copy** of an external agent-skills pack. It is NOT Paperclip-native code. Treat every file here as untrusted-until-audited content from a third party.

## Upstream

- Repo: <https://github.com/addyosmani/agent-skills>
- License: MIT
- Pinned commit: `1f66d57a5e1b041b11e49a8cdca275aa472f0131`
- Pinned date: `2026-04-20`
- Imported into Paperclip on: `2026-04-23`

## Why vendor instead of fetch-on-demand

We deliberately copy the upstream content into this repo so that:

1. We can audit every file before it ships to any company.
2. A future malicious upstream commit cannot reach our agents without an explicit human bump in this repo.
3. The Paperclip fork has zero runtime dependency on the upstream repo's availability.

## Layout

```
skills/vendor/agent-skills/
├── VENDOR.md                      # this file
├── skills/                        # 21 SKILL.md trees (consumed by Paperclip runtime)
│   ├── api-and-interface-design/SKILL.md
│   ├── browser-testing-with-devtools/SKILL.md
│   ├── ci-cd-and-automation/SKILL.md
│   ├── code-review-and-quality/SKILL.md
│   ├── code-simplification/SKILL.md
│   ├── context-engineering/SKILL.md
│   ├── debugging-and-error-recovery/SKILL.md
│   ├── deprecation-and-migration/SKILL.md
│   ├── documentation-and-adrs/SKILL.md
│   ├── frontend-ui-engineering/SKILL.md
│   ├── git-workflow-and-versioning/SKILL.md
│   ├── idea-refine/                       # also has refinement-criteria.md, frameworks.md, examples.md, scripts/idea-refine.sh
│   ├── incremental-implementation/SKILL.md
│   ├── performance-optimization/SKILL.md
│   ├── planning-and-task-breakdown/SKILL.md
│   ├── security-and-hardening/SKILL.md
│   ├── shipping-and-launch/SKILL.md
│   ├── source-driven-development/SKILL.md
│   ├── spec-driven-development/SKILL.md
│   ├── test-driven-development/SKILL.md
│   └── using-agent-skills/SKILL.md
├── references/                    # 5 supplementary checklists (kept for skills that reference them)
│   ├── accessibility-checklist.md
│   ├── orchestration-patterns.md
│   ├── performance-checklist.md
│   ├── security-checklist.md
│   └── testing-patterns.md
└── hooks/                         # NOT WIRED — kept on disk for future evaluation only
    ├── SDD-CACHE.md
    ├── SIMPLIFY-IGNORE.md
    ├── hooks.json
    ├── sdd-cache-post.sh
    ├── sdd-cache-pre.sh
    ├── session-start.sh
    ├── simplify-ignore-test.sh
    └── simplify-ignore.sh
```

## What we DID import

- All 21 skill directories under `skills/<name>/`. They surface as Paperclip skills with `sourceKind: "paperclip_bundled_optional"` and `key: "addyosmani/agent-skills/<slug>"`.
- The `references/` checklists (some skills link to them).

## What we DELIBERATELY did NOT import

- `agents/` (3 personas: code-reviewer, test-engineer, security-auditor). These are Claude-Code-specific persona prompts, not Paperclip agent definitions. Evaluating as a separate issue if we want those roles.
- `.claude/commands/` (7 slash commands: `/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`). Slash commands are CLI-runtime constructs that don't map to Paperclip's heartbeat lifecycle.
- `docs/` (per-tool setup guides for Claude Code, Cursor, Copilot, Gemini CLI, OpenCode, Windsurf). Not relevant to Paperclip runtime.
- `.claude-plugin/` (Claude Code plugin manifest). Not applicable — Paperclip has its own bundling mechanism.
- `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `LICENSE`. License is preserved in this VENDOR.md as MIT.

## What we imported but did NOT wire into runtime

- `hooks/` is kept on disk for inspection and future evaluation. NONE of the bash scripts in it are executed by Paperclip. They are upstream artifacts tied to the Claude Code session lifecycle (`SessionStart` hook). If we want hook semantics in Paperclip, that's a separate design problem (different runtime, different lifecycle).

## Runtime semantics

Paperclip's bundled-skills loader (`server/src/services/company-skills.ts → ensureBundledSkills`) discovers this directory and:

1. Inserts each of the 21 skills into every company's `company_skills` table on first access.
2. Marks them with `metadata.sourceKind = "paperclip_bundled_optional"` and `metadata.owner = "addyosmani"` / `metadata.repo = "agent-skills"`.
3. Derives the canonical key `addyosmani/agent-skills/<slug>`.
4. **Does NOT mark them as `required: true`.** They are available to every company but only loaded into an agent's runtime prompt when the agent explicitly opts in via `adapterConfig.paperclipSkillSync.desiredSkills`.

This is deliberate. With 21 skills averaging ~12 KB of markdown each, marking them all as required would inflate every agent's prompt by ~250 KB regardless of relevance.

The 4 Paperclip-native bundled skills (`paperclip`, `paperclip-create-agent`, `paperclip-create-plugin`, `para-memory-files`) live one level up in `skills/<name>/` and continue to use `sourceKind: "paperclip_bundled"` with `required: true`.

## Audit checklist (run on every bump)

Before bumping the pinned commit, run through:

- [ ] Diff the upstream against this vendored copy (`diff -ru` from a fresh clone).
- [ ] Inspect every changed `SKILL.md` for prompt-injection patterns ("ignore previous instructions", obfuscated base64, hidden zero-width chars).
- [ ] Inspect every changed shell script for `curl | sh`, `eval`, `base64 -d | sh`, exfiltration, or destructive ops outside the working tree.
- [ ] Confirm no new file types appear (binaries, executables, archives).
- [ ] Confirm the upstream license is still MIT (or compatible).
- [ ] Update the pinned commit SHA and date in this file.
- [ ] Update the layout section if upstream added/removed skill directories.

## Bump procedure

```sh
# 1. Clone upstream at the desired commit
git clone https://github.com/addyosmani/agent-skills /tmp/agent-skills-bump
cd /tmp/agent-skills-bump
git checkout <new-commit-sha>

# 2. Diff against current vendored copy
diff -ru /tmp/agent-skills-bump/skills /paperclip/workspaces/paperclip/skills/vendor/agent-skills/skills
diff -ru /tmp/agent-skills-bump/references /paperclip/workspaces/paperclip/skills/vendor/agent-skills/references
diff -ru /tmp/agent-skills-bump/hooks /paperclip/workspaces/paperclip/skills/vendor/agent-skills/hooks

# 3. Run the audit checklist above on every diff hunk.

# 4. Sync the trees (preserving VENDOR.md):
rsync -a --delete /tmp/agent-skills-bump/skills/ /paperclip/workspaces/paperclip/skills/vendor/agent-skills/skills/
rsync -a --delete /tmp/agent-skills-bump/references/ /paperclip/workspaces/paperclip/skills/vendor/agent-skills/references/
rsync -a --delete /tmp/agent-skills-bump/hooks/ /paperclip/workspaces/paperclip/skills/vendor/agent-skills/hooks/

# 5. Update this file's "Pinned commit" / "Pinned date" / "Imported into Paperclip on".
# 6. Commit with a message that links the upstream commit and lists notable additions/removals.
```

## License (upstream)

MIT — see <https://github.com/addyosmani/agent-skills/blob/main/LICENSE>. Reproduced obligation: include the MIT license text in distributions. The full license text travels with the upstream repo; the SKILL.md files in this directory inherit those terms.
