---
name: review-pr
description: Review a pull request in this repo for design, duplication, bugs and repo-rule issues, and report ranked findings. Use when asked to review a PR or re-review new commits on one.
argument-hint: [PR link or number]
---

# Review PR

Judge whether the change leaves the product stable and easy to maintain, not just whether it works.

## 1. Gather

- Fetch the PR (body, commits, files) and its linked issue. On a re-review, diff only the new commits, and check whether earlier findings were fixed.
- Check out the head. Run `npm run lint`, `npm test`, `npm run build`. For type errors, compare `npx tsc --noEmit -p tsconfig.json` against the base branch; only new errors count.
- Read `CLAUDE.md` and the `AGENTS.md` files for every area touched.

## 2. Look for (priority order)

1. **Design fighting the frameworks.** If code is long, defensive or keeps breaking, ask whether a requirement is forcing it to work against CodeMirror, React, the DOM, Electron or markdown. Say so plainly and propose the cheaper design, even unasked. Typical signs: manual positioning and focus juggling, registries of DOM nodes, reimplemented framework features, workarounds for browser limits.
2. **Duplication and reimplemented logic.** Before accepting a helper, search for an existing one (ranking, markdown parsing, validation, positioning, label resolution, derivation shared by main and renderer). Flag copies that have already drifted.
3. **Bugs.** Reproduce each suspected bug with a throwaway test, then delete it. Label each finding *reproduced* or *by reading*. Include a concrete failure scenario.
4. **Repo rules.** Everything in `CLAUDE.md` and the `AGENTS.md` files. In particular: no logic in hooks/components, but pure helpers grouped by feature, not one function per file; theme tokens only; kebab-case; commit/PR conventions; `AGENTS.md` updated to match the change.
5. **Dead or speculative code.** Unused props, escape hatches no caller uses, "backwards compatibility" for unreleased code, leftovers from a replaced approach, comments that narrate history instead of describing current behaviour.
6. **Consistency.** One source of truth for constants, types and rules. Safeguards should apply by default (deny unless explicitly allowed), not only to code that remembers to opt in.

## 3. Respect product decisions

Don't re-argue these:
- Note and event files must stay readable without the app.
- Flexibility for any RPG is the point; generic engines (e.g. custom tracks) are intended, not over-engineering.
- IDs never change once set. Directives have no IDs; only compare their positions within one parse of the same text.
- Good UX is worth code, but still check the code is the right size for it.

Don't re-raise anything the user has already decided in the conversation or on the PR.

## 4. Report

- Rank findings: 🔴 blocking · 🟠 should fix in this PR · 🟡 smaller / cleanup. Anchor each to `file:line`.
- Measure before quoting a number (lines, counts, timings). Never estimate as if measured.
- For a suggested refactor, list the behaviours that must not change, so tests can pin them first.
- Open with a one-paragraph verdict, and say what's good as well as what's wrong.
- Answer the user's questions directly.
- Report in chat by default. Post to GitHub only when asked: a *Comment* review with inline comments, plus a short summary.
