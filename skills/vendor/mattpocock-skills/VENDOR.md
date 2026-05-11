# Vendor: mattpocock/skills (selective)

This directory is a **pinned, vendored copy** of a hand-picked subset of Matt Pocock's agent-skills pack. It is NOT Paperclip-native code. Treat every file here as untrusted-until-audited content from a third party.

## Upstream

- Repo: <https://github.com/mattpocock/skills>
- License: MIT
- Pinned commit: `f71bb975bfae2dc0d31c529c7dd4a8479ecc3748`
- Pinned date: `2026-04-29`
- Imported into Paperclip on: `2026-04-30`

## Why vendor instead of fetch-on-demand

We deliberately copy the upstream content into this repo so that:

1. We can audit every file before it ships to any company.
2. A future malicious upstream commit cannot reach our agents without an explicit human bump in this repo.
3. The Paperclip fork has zero runtime dependency on the upstream repo's availability.

## Why a selective vendor (only 6 of 22 skills)

Upstream ships ~22 skills. We deliberately picked the 6 below because they are high-value and **non-overlapping with our existing vendors and the Paperclip runtime model**. The rest were skipped for one of three reasons:

- **Duplicates an existing vendor** (`tdd` overlaps with addyosmani's `test-driven-development`; `caveman` overlaps with the already-installed `juliusbrussee/caveman`).
- **Assumes a different issue tracker** (`triage`, `to-prd`, `to-issues` assume GitHub/Linear and conflict with Paperclip's first-class issue model).
- **Out of scope** (`setup-matt-pocock-skills`, `git-guardrails-claude-code`, `setup-pre-commit`, `migrate-to-shoehorn`, `scaffold-exercises`, `edit-article`, `obsidian-vault`, and the entire `deprecated/` category).

When upstream adds new skills in future bumps, evaluate each one against the same scoping rules before pulling it in.

## Layout

```
skills/vendor/mattpocock-skills/
├── VENDOR.md                                                 # this file
└── skills/                                                   # 6 SKILL.md trees (consumed by Paperclip runtime)
    ├── engineering/
    │   ├── diagnose/
    │   │   ├── SKILL.md
    │   │   └── scripts/hitl-loop.template.sh                 # benign interactive shell template
    │   ├── grill-with-docs/
    │   │   ├── SKILL.md
    │   │   ├── ADR-FORMAT.md
    │   │   └── CONTEXT-FORMAT.md
    │   ├── improve-codebase-architecture/
    │   │   ├── SKILL.md
    │   │   ├── DEEPENING.md
    │   │   ├── INTERFACE-DESIGN.md
    │   │   └── LANGUAGE.md
    │   └── zoom-out/SKILL.md
    └── productivity/
        ├── grill-me/SKILL.md
        └── write-a-skill/SKILL.md
```

The category subdirectories (`engineering/`, `productivity/`) mirror upstream layout. The bundled-skills loader (`server/src/services/company-skills.ts → ensureBundledSkills`) walks the tree recursively and registers any directory containing a `SKILL.md`, so the categories are descriptive only and do not affect skill keys.

## What we DID import

- **`engineering/diagnose`** — disciplined diagnosis loop ("Phase 1 is the skill" — build a feedback loop first). Complementary to addyosmani's `debugging-and-error-recovery`; different framing.
- **`engineering/grill-with-docs`** — interview-driven plan stress-testing tied to `CONTEXT.md` + ADRs. No equivalent in our existing vendors.
- **`engineering/improve-codebase-architecture`** — refactor surfacing under "deepening opportunities"; complements addyosmani's `code-simplification`.
- **`engineering/zoom-out`** — short prompt that asks the agent to step up an abstraction level. Tiny but surprisingly useful for cold-start agents.
- **`productivity/grill-me`** — one-on-one design-grilling interviewer.
- **`productivity/write-a-skill`** — meta-skill for authoring new agent skills.

The `improve-codebase-architecture` skill cross-references files in `grill-with-docs/` (`../grill-with-docs/CONTEXT-FORMAT.md`, `../grill-with-docs/ADR-FORMAT.md`). That's why both skills must travel together — do not drop one without the other.

## What we DELIBERATELY did NOT import

- **Skills duplicating existing vendors:** `engineering/tdd` (have addyosmani's `test-driven-development`), `productivity/caveman` (have `juliusbrussee/caveman`).
- **Skills assuming an external issue tracker:** `engineering/triage`, `engineering/to-prd`, `engineering/to-issues`. Paperclip's issue model is first-class; using these would create two competing sources of truth.
- **Bootstrap / setup skills:** `engineering/setup-matt-pocock-skills` (irrelevant in vendor mode), `misc/setup-pre-commit`, `misc/git-guardrails-claude-code` (overlaps with our `CLAUDE.md` git rules).
- **Project-specific skills:** `misc/migrate-to-shoehorn`, `misc/scaffold-exercises`.
- **Personal skills:** `personal/edit-article`, `personal/obsidian-vault`.
- **The entire `deprecated/` category** (`design-an-interface`, `qa`, `request-refactor-plan`, `ubiquitous-language`).
- **Top-level project files:** `README.md`, `CLAUDE.md`, `CONTEXT.md`, `LICENSE`, `.claude-plugin/`, `.out-of-scope/`, `docs/`, `scripts/`. License is preserved in this VENDOR.md as MIT.

## Runtime semantics

Paperclip's bundled-skills loader (`server/src/services/company-skills.ts → ensureBundledSkills`) discovers this directory via a second `BundledSkillsRootSpec` entry (alongside the existing addyosmani entry) and:

1. Inserts each of the 6 skills into every company's `company_skills` table on first access.
2. Marks them with `metadata.sourceKind = "paperclip_bundled_optional"` and `metadata.owner = "mattpocock"` / `metadata.repo = "skills"`.
3. Derives the canonical key `mattpocock/skills/<slug>` (e.g. `mattpocock/skills/diagnose`).
4. **Does NOT mark them as `required: true`.** They are available to every company but only loaded into an agent's runtime prompt when the agent explicitly opts in via `adapterConfig.paperclipSkillSync.desiredSkills`.

This matches the model used by the addyosmani vendor — opt-in per agent, not blanket-required.

## Notes on upstream-specific frontmatter

- `grill-with-docs/SKILL.md` and `zoom-out/SKILL.md` carry `disable-model-invocation: true` in their frontmatter. This is a Claude-Code-specific signal that the skill should not be auto-invoked by the model and is meant to be triggered by the user explicitly. Paperclip ignores unknown frontmatter today, so the flag is preserved verbatim and has no runtime effect on this fork. If/when Paperclip starts honouring it, it will continue to mean "user-invocation only".

## Audit checklist (run on every bump)

Before bumping the pinned commit, run through:

- [ ] Diff the upstream against this vendored copy (`diff -ru` from a fresh clone, scoped to the 6 imported skills).
- [ ] Inspect every changed `SKILL.md` (and any cross-referenced `*-FORMAT.md` / `LANGUAGE.md` / `DEEPENING.md` / `INTERFACE-DESIGN.md`) for prompt-injection patterns ("ignore previous instructions", obfuscated base64, hidden zero-width chars).
- [ ] Inspect every changed shell script for `curl | sh`, `eval`, `base64 -d | sh`, exfiltration, or destructive ops outside the working tree.
- [ ] Confirm no new file types appear (binaries, executables, archives).
- [ ] Confirm the upstream license is still MIT (or compatible).
- [ ] Re-evaluate any newly-added upstream skills in non-imported categories — do they now meet our scoping rules?
- [ ] Update the pinned commit SHA and date in this file.
- [ ] Update the layout section if upstream restructured an imported skill directory.

## Bump procedure

```sh
# 1. Clone upstream at the desired commit
git clone https://github.com/mattpocock/skills /tmp/mattpocock-skills-bump
cd /tmp/mattpocock-skills-bump
git checkout <new-commit-sha>

# 2. Diff against current vendored copies (one per imported skill)
for s in engineering/diagnose engineering/grill-with-docs engineering/improve-codebase-architecture engineering/zoom-out productivity/grill-me productivity/write-a-skill; do
  diff -ru "/tmp/mattpocock-skills-bump/skills/$s" "/paperclip/workspaces/paperclip/skills/vendor/mattpocock-skills/skills/$s"
done

# 3. Run the audit checklist above on every diff hunk.

# 4. Sync each imported skill, preserving VENDOR.md:
for s in engineering/diagnose engineering/grill-with-docs engineering/improve-codebase-architecture engineering/zoom-out productivity/grill-me productivity/write-a-skill; do
  rsync -a --delete "/tmp/mattpocock-skills-bump/skills/$s/" "/paperclip/workspaces/paperclip/skills/vendor/mattpocock-skills/skills/$s/"
done

# 5. Update this file's "Pinned commit" / "Pinned date" / "Imported into Paperclip on".
# 6. Commit with a message that links the upstream commit and lists notable additions/removals.
```

## License (upstream)

MIT — see <https://github.com/mattpocock/skills/blob/main/LICENSE>. Reproduced obligation: include the MIT license text in distributions. The full license text travels with the upstream repo; the SKILL.md files in this directory inherit those terms.
