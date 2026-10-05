---
name: review-code
description: Review a set of changes in this repo — a PR, a branch, or one task's worktree during orchestration — for design, duplication, bugs and repo-rule issues, and return ranked findings. Use when asked to review code or re-review new commits.
argument-hint: [PR number/link, branch, or worktree path]
---

# Review Code

Judge whether the change leaves the product stable and easy to maintain, not just whether it works.

## 1. Establish what you're reviewing

- **PR:** fetch its body, commits and linked issue; the diff is head vs. its base branch.
- **Branch or worktree:** the diff is against the base you were given (for an orchestrated task, the feature branch, not `main`). If none was given, use the branch it was cut from.
- **Re-review:** diff only the new commits, and check whether earlier findings were fixed.
- If you were given a plan and a task within it, judge the change against that task, and flag anything outside its scope.
- Read `CLAUDE.md` and the `AGENTS.md` files for every area touched. Don't re-run lint, tests or build; CI does that.

## 2. Look for (priority order)

1. **Design fighting the frameworks.** If code is long, defensive or keeps breaking, ask whether a requirement is forcing it to work against a framework the app uses (e.g. CodeMirror, React, Electron, markdown). Fighting a framework produces brittle code and a brittle product. Say so plainly and propose the cheaper design, even unasked. Typical signs: manual focus or positioning, registries of DOM nodes, reimplemented built-ins, workarounds for platform limits.
2. **Duplication and reimplemented logic.** Before accepting a new helper, search for an existing one. Flag copies that have already drifted.
3. **Bugs.** Reproduce each suspected bug with a throwaway test, then delete it. Label each finding *reproduced* or *by reading*, with a concrete failure scenario.
4. **Repo rules.** Everything in `CLAUDE.md` and the relevant `AGENTS.md` files, including that `AGENTS.md` is updated to match the change.
5. **Dead or speculative code.** Unused props, escape hatches with no caller, "backwards compatibility" for unreleased code, leftovers from a replaced approach, comments that narrate history.
6. **Consistency.** One source of truth for constants, types and rules. Safeguards apply by default, not only to code that opts in.

## 3. Respect product decisions

Don't re-argue these:
- Note and event files must stay readable without the app.
- Flexibility for any RPG is the point; generic engines (e.g. custom tracks) are intended, not over-engineering.
- IDs never change once set.
- Good UX is worth code, but still check the code is the right size for it.

Don't re-raise anything already decided in the conversation, the plan, or on the PR.

## 4. Report

- Open with a one-paragraph verdict, including what's good.
- Rank findings: 🔴 blocking · 🟠 should fix · 🟡 smaller / cleanup. Anchor each to `file:line`.
- Measure before quoting a number (lines, counts, timings). Never present an estimate as a measurement.
- For a suggested refactor, list the behaviours that must not change.
- Return the report to whoever asked. Don't post to GitHub or change the code; they decide what to act on.
