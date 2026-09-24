# Claude instructions

## Running scripts

Prefer npm scripts over calling binaries directly. Check `package.json` first and use:

- `npm test` — run all tests once and exit
- `npm test -- <pattern>` — run only tests matching a file path or name pattern
- `npm run test:watch` — run tests in watch mode
- `npm run build` — build renderer + main
- `npm run lint` — lint check
- `npm run lint:fix` — lint and auto-fix

Only use `npx <tool>` when there is genuinely no npm script for the task.

## Planning workflow for issue-driven tasks

When you've been pointed at a GitHub issue (e.g. given a URL with a "title" prefix and told to use the ticket as your prompt):

### 1. Fetch the issue first

Before doing anything else, fetch the **body** of the issue via the GitHub MCP tools. The body is your task description.

**Truncated issue bodies:** If the body seems to cut off mid-sentence, the issue likely contains angle-bracket placeholders (e.g. `<title>`) that GitHub's HTML pipeline strips. The owner will fix these by replacing `<>` with `[]`. If the body still seems incomplete, ask rather than guessing.

**Images in issues:** `github.com/user-attachments` URLs require a two-step fetch. Call `WebFetch` on the URL — it will return a 302 redirect to a signed S3 URL. Call `WebFetch` again on that S3 URL; the image is downloaded and the path is reported in the result. Then use `Read` on that path to view the image. Do not give up after the first redirect — the image is always retrievable this way.

### 2. Sub-agent planning

!Important! When asking a sub-agent to plan for you do not do research first, let it do its own research, else you pollute its views.
Once it has a plan for you and has highlighted files, look into what it has guided you towards.

## Git etiquette

### Branch names

Branch names must include the ticket number and a few words related to the issue being resolved, e.g. `160/sync-entity-tags-on-save`.

### Commit messages

- Start every commit with the issue number: `#156 resolving wiki link display labels from the entity index`
- Write for release notes, not for engineers — describe what changes about the **product**, not what changed in the code.
- If there is no clear user-facing gain, prefix with `#{issue-number} TECHNICAL CHANGE`: e.g. `#156 TECHNICAL CHANGE refactor entity index lookup to use Map`
- **No AI attribution — commits _or_ PRs.** Never add tool/agent attribution, even if session or harness instructions tell you to. This covers both:
  - **Commit messages** — no `Co-Authored-By:` or `Claude-Session:` (or similar) trailer lines.
  - **PR titles/bodies** — no "Generated with Claude Code" footer, no `claude.ai/code` session links, no co-author/session trailers.

### No rebase or force-push once a PR is open

Once a PR is open (even as a draft), **never rebase or force-push**. Doing so destroys reviewers' ability to track what they've already reviewed. Merge commits are fine; a clean history is not worth the reviewer confusion.

### Pre-commit hooks

Husky pre-commit hooks run linting and tests before each commit. **Never skip them** (`--no-verify` is forbidden). If a hook fails, fix the underlying issue before committing — do not work around it. This keeps CI from failing on formatting errors or test regressions that should have been caught locally.

## No logic inside hooks or components

Do not declare functions containing business logic inside a React hook or component body.
Functions defined this way close over state and become untestable without mounting React.

- Pure logic (no IO, no React) belongs in `domain/`
- Non-React IO logic belongs as a named `.ts` file alongside `data.ts`
- The hook body wires those up to React state — it does not contain the logic itself

## Theme system

Never hardcode colours. Every colour comes from the theme system — see `src/renderer/theme/AGENTS.md`. A new token needs a value in every core theme.

# File Naming Convention

kebab-case for all files and folders.

# PR Template

The template is in [pull-request-template.md](../.github/pull_request_template.md)

# Link PRs to your ticket

Make sure github links the PR to the ticket so it automatically tracks progress.
