# Plan 1 — follow-ups (deferred minors from reviews)

Collected from task reviews and the final review; none block the Plan 1 PR.

- Task 1: minor (deferred): CLI devDeps use ^ ranges; CLI uses TS 7 while generated repos use TS 6.0.3 (R5).
- Task 2: minor (deferred): no multi-issue error-format test; no test for backend uses/provided uses; name/app-name validity left to rules (Task 4 app-name-valid covers it).
- Task 3: minor (deferred): mergeJson __proto__ key handling (use Object.hasOwn); mergeTrees JSON parse error lacks path; missing tests for array-of-objects dedupe, unknown {{token}}, non-.tpl files; registry silently overwrites duplicate ids.
- Task 4: minor (deferred): tests for default-vs-explicit port collision (incl. later app), threading assertion, weak 'rest' assertion; unbounded port bump; mutable rules array.
- Task 6: parked — Nx outputs '!{projectRoot}/.next/cache' negation unverified — Ruling: Task 14 e2e (nx combos) verifies; fix there if Nx rejects it.
- Task 5: minor (deferred): README uses @manifest.name vs ctx.scope; pnpm test regex not pinned to VERSIONS; CI --frozen-lockfile needs committed lockfile; writeTree path escape / ENOTDIR raw error.
- Task 10: minor (deferred): create/load identifiers not Pascal-cased (createapiClient); VITE url no dev fallback; Dockerfile test depth; no HEALTHCHECK for nginx stage; empty api.ts lacks header.
- Task 11: minor (deferred): __dirname comment in next.config template; `next start` under standalone warns; next-env.d.ts not generated.
- Task 9: minor (deferred): require(esm) needs Node >=22.12 undocumented in generated README; typecheck dependsOn build makes Next typecheck run next build (slower).
- Task 12: minor (deferred): raw stack traces for non-CliError (ENOTDIR, spawn error) — also routed to T14 as cheap fold; no guidance after failed install; interactive name ignores [dir]; duplicated port check; interactive abort on validation errors.
- Task 13: minor (deferred): unused opts.json; interactive name prompt unvalidated in cli addApp; --uses split doesn't trim; no nx test for add; existing backends' .env.example CORS not updated on frontend add (user-owned).
- Task 15: minor (deferred): README uses bare `octorepo add app` (should say npx); shebang banner on every unbundled module; no automated packaging test; CONTRIBUTING depends on Task 14 scripts being committed.
- Task 14: minor (deferred): cleanup calls can throw inside finally; bare catch drops errors; no SIGINT cleanup; combos.ts entrypoint guard breaks on paths with spaces; no OCTOREPO_DEBUG hint; matrix job full install; no store cache/retry in CI.
- Final: client build and dev both run at dev start (duplicate work); ui-react name always reserved.
