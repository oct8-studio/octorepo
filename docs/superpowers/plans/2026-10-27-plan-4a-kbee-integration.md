# Plan 4a — kbee integration (`--kbee`) — Implementation Plan

**Goal:** opt-in `--kbee` (+ interactive question + MCP `create.kbee`) that sets up oct8 studio's kbee knowledge-base skills in a generated repo: pre-filled in-repo `kb/manifest.json`, kbee skills committed into the repo, AGENTS.md kbee pointer + contract hints, `add app` keeps the manifest in sync. Release as 0.4.0.

**Why:** kbee (github.com/oct8-studio/kbee) now supports in-repo KBs and monorepos. octorepo knows the repo map at generation time; kbee needs exactly that map (manifest entries per package) to start. Generated repos become "agent-native" end to end: octorepo scaffolds, kbee keeps cited knowledge.

**Verified facts (research 2026-10-27, from kbee @ b4b8343):**
- kbee discovers `kb/manifest.json` at the git root; the only config is that manifest. Valid shape: `{ kbeeVersion: 1, mode: "direct", location: "in-repo", rulesVersion: <current>, repos: [{ name (^[a-z0-9][a-z0-9._-]*$), defaultBranch, pathHint (relative to kb/, e.g. "../apps/api"), syncedSha: null, syncedAt: null }] }`. A manifest-only kb/ validates with zero errors, even before the first commit (tested with kbee-tool).
- In-repo citations are sha-less `[repo:path:line]`; facts must be verified by kbee's agent — octorepo must NOT write system-map/overview/contracts facts.
- Pointer block in AGENTS.md: `<!-- kbee:start -->` … `kbee-kb-path: kb` … `<!-- kbee:end -->`.
- Skills install: `npx skills add oct8-studio/kbee -a claude-code codex -y --copy` (project-local; real files under `.agents/skills/kbee*`, Claude Code copies under `.claude/skills/kbee*`, plus `skills-lock.json`). Needs network → fallback to printed manual command like runPostSteps.
- Current kbee rulesVersion is 2; kbee may bump it.

## Global constraints
- All Plan 1–3 constraints and rulings bind (tool-owned paths, biome-clean output, --json purity, manifest schemaVersion 1 additive fields, exact versions).
- kbee is opt-in; default off. `--kbee` with `--no-git` → CliError (in-repo KB needs git).
- Manifest entry names come from app/package dir names (already valid: lowercase, hyphens); order: backends first (most central), then frontends, then `types`, then `db` (if orm). No `*-client` entries, no services.
- rulesVersion: a constant `KBEE_RULES_VERSION` in src/versions.ts (current: 2) — documented as "bump when kbee's rules-changelog bumps".
- `.octorepo.json` gains optional `kbee: true`.
- Tool-owned: `kb/manifest.json` only for its `repos` entries (merge: add missing entries for new apps/packages; never remove, never touch existing entries' syncedSha/syncedAt/defaultBranch, never touch other keys). Everything else in `kb/` is kbee's.

## Tasks
1. **Model + manifest generator:** `stack.kbee?: boolean`; `kbeeFiles(ctx)` → `kb/manifest.json`, `kb/.gitignore` (`.kbee.local.json`), `kb/features/.gitkeep`; AGENTS.md kbee pointer block + "Contracts to document" hint list (frontend → backend via packages/<backend>-client from apps/<backend>/openapi.json) replacing `kbeeHint()` when kbee is on (keep the hint when off). Rule: `--kbee` + no git → error. Tests incl. validating the generated manifest against kbee's rules (port the regex/required-field checks into a unit test).
2. **Post-step install:** after `pnpm install` + biome, before git init/commit-less end: `npx skills add oct8-studio/kbee -a claude-code codex -y --copy` in the repo; failure/offline → add to manual steps. Next steps print: "git add -A && git commit -m init" then "In Claude Code / Codex: /kbee audit". `--no-install` → manual step. Tests with a fake `npx` on PATH (like post.test.ts patterns).
3. **add app / add service sync:** `add app` upserts the new app (and `db` when orm newly applies) into `kb/manifest.json` when the repo has kbee; never removes. `add service` doesn't touch entries. Tests.
4. **CLI/MCP/prompts/docs:** `--kbee` flag, interactive "Set up kbee (AI knowledge base)?" (default no), MCP `create` input `kbee`, `options` lists it; README section "kbee: a knowledge base for your agents" (what it is, what octorepo sets up, first-commit + `/kbee audit` flow), CHANGELOG 0.4.0 (Unreleased).
5. **CI + release prep:** e2e fixture `fixtures/kbee.json` (turbo, next+nest+postgres+drizzle, kbee: true) run with `--dev --no-docker`-equivalent checks plus: `kb/manifest.json` exists and validates via a vendored copy of kbee's `validateManifest` logic or by running kbee-tool from a pinned kbee git ref (`npx -y github:oct8-studio/kbee#<sha>` if runnable; otherwise unit-level validation is the gate); skills install step allowed to fail soft in CI if network blocks. Bump to 0.4.0 (both packages + plugin.json). Do not publish.
