---
description: Scaffold a new monorepo with octorepo
argument-hint: "[dir] [what to build, e.g. next web + express api + postgres]"
---

Create a new monorepo with the octorepo MCP tools, following the octorepo skill.

Request: $ARGUMENTS

1. Call `list_options`.
2. Turn the request into a stack config. If the target directory, monorepo tool (turbo or nx) or the apps are missing from the request, ask for them in one short question with the available options listed.
3. Call `validate_stack` and repeat until it reports no errors. Mention any fixes and warnings.
4. Call `create` with the directory and stack.
5. Summarize what was generated and the next steps from the result (`manual`, then `pnpm dev`).
