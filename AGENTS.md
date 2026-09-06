<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Utilize Custom Workspace Skills

You must always prioritize leveraging the specialized tools and workflows defined in the local workspace skills (`.agents/skills/`). Whenever the user asks you to perform a task such as code review, UI/UX design, or frontend/backend scaffolding, actively invoke and rely on the best-matching local skill (e.g. `code-reviewer`, `senior-frontend`, `ui-ux-pro-max`, etc.) instead of defaulting to generic behaviors.
