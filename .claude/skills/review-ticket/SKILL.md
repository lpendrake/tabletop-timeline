---
name: review-ticket
description: Collaboratively refine one specific GitHub issue before work starts.
disable-model-invocation: true
argument-hint: [issue link or number]
---

# Review Ticket

Be a thinking partner who turns a half-formed GitHub issue into a clear,
actionable ticket. The goal is not to rewrite the issue *for* the user, but to
interrogate it *with* them: surface gaps, name assumptions, pull in context the
issue assumes but doesn't state, and converge on a body you both trust. Nothing
is written back to GitHub until the user has seen the exact final text and
approved it.

All GitHub reads and writes go through the **GitHub MCP connector**. If those
tools aren't available, say so and stop — don't fall back to guessing or to
pasting instructions you can't execute.

---

## The process

Work through these phases in order. Phases 1–4 are conversational and loopy;
phase 5 is a hard gate; phase 6 is mechanical and must match what was approved.

### 1. Orient — find and read the issue

- The ticket to review is referenced by `$ARGUMENTS` — the issue link or number
  passed when the skill is invoked (e.g. `/review-ticket 123`). Resolve it to a
  single issue. If `$ARGUMENTS` is empty or names more than one issue, ask which
  one before reading anything.
- Fetch it through the GitHub MCP connector: title, body, labels, assignees,
  linked issues/PRs, and existing comments.
- Confirm the `ai-review-requested` label is present. This label is required —
  it is the signal that an issue is meant for this workflow. If it's missing,
  stop and ask the user to add the label (or to explicitly confirm an override)
  before continuing. Don't review an unlabeled issue by default.
- Read the existing comments fully. Prior discussion often already contains
  half the answers to "what's missing"; don't make the user repeat themselves.

### 2. Build context — understand the repo, not just the issue

A good ticket reflects the codebase it lives in. Before diagnosing, gather what
the issue is silently leaning on:

- **Issue templates** (`.github/ISSUE_TEMPLATE/`) — if one exists, the final
  body should respect its structure. Match the headings the project already
  uses rather than inventing your own.
- **Contribution norms** — `CONTRIBUTING.md`, `README`, docs that define how
  this project expects issues to be written (labels, definition of done,
  required sections).
- **Agent files** — files that tell agents how to work in this repo and which
  parts are relevant: `AGENTS.md`, `CLAUDE.md`, files under `.claude/`
  (including `.claude/agents/`), `.cursor/`, or similar. Work out *which* of
  these are relevant to this specific ticket and flag them, so the eventual
  implementer knows where the guardrails and conventions live.
- **Relevant code** — the modules and configs the ticket touches. Read enough
  to ground your questions in reality, but don't go spelunking the whole repo.
- **Related tickets** — only those with a relationship *defined on the issue
  itself*: its parent issue, its sub-issues, and any linked issues/PRs or
  explicit references in the body (e.g. "blocks #12", "part of #34"). Read their
  title and body for context. Do not search the tracker for thematically
  "similar" issues, and don't follow relationships of relationships — stay one
  hop from this ticket. This keeps context bounded and avoids tenuous links.

Verify, don't invent. If you state something about the codebase, it should come
from a file you actually read. Anything you're inferring, label as an
assumption to be confirmed — not as fact.

### 3. Diagnose — what's missing, assumed, or unclear

Produce a focused read of the issue covering:

- **Missing information** — whatever a competent implementer would need and
  can't find here: reproduction steps, expected vs. actual behaviour, scope
  boundaries, acceptance criteria, affected versions/environments, edge cases.
- **Unstated assumptions** — implicit knowledge the author has in their head but
  didn't write down. Make these explicit so they can be confirmed or corrected.
- **Ambiguities** — places where the issue could be read more than one way.
- **Context worth adding** — the repo findings from phase 2 that belong in the
  ticket (e.g. "this touches the auth module; per `CLAUDE.md` that area
  requires X").

Lead with the questions that most change the shape of the ticket. Don't dump
twenty nitpicks at once.

### 4. Brainstorm — refine the body together

This is a collaboration, not a takeover.

- Ask, propose, and react — but let the user steer. When you suggest wording or
  structure, show it as a proposal, not a fait accompli.
- Push back when something seems underspecified, contradictory, or out of
  scope. A genuine thinking partner disagrees usefully; explain your reasoning
  rather than just asserting.
- Offer structure when it helps (e.g. a problem / proposed-solution /
  acceptance-criteria shape), but defer to any existing template.
- Iterate as many rounds as the user wants. There's no rush to converge.

**Work in draft files.** This skill turns a rough issue — often a waffly,
half-formed idea dump — into a formal ticket: clear sections, real requirements,
no repetition or contradictions, written to a professional standard. Keep two
files in `.claude/issue-reviews/issue-<number>/`:

- `original-body.md` — the issue's body exactly as it was when review started.
  Write it once and don't edit it; it's the original "prompt", kept for
  reference so the source intent is always recoverable without re-querying
  GitHub.
- `new-body.md` — the refined body you build together. Don't seed it from the
  original; draft it fresh into sensible sections (following any issue template
  from phase 2), pulling the real intent and requirements out of
  `original-body.md` while leaving the waffle behind.

Once drafting starts, `new-body.md` — not a chat message — is the single
evolving source of truth for the body. Comparing it against `original-body.md`
shows exactly what changed.

### 5. Approval gate — define, review, freeze

This gate exists so the user can trust that **what they approve is exactly what
gets written**. The draft file makes this concrete: the artifact under review is
the current contents of `new-body.md`, and that file — unchanged — is what gets
set as the body.

- Make sure the user has seen the file's final state. Either show its full
  contents or confirm they've read it as it stands; don't seek approval for
  something they haven't actually looked at.
- Ask for explicit approval of the file as it currently is. Wait for an
  unambiguous go ("approved", "yes, set it", "ship it"). Silence, a thumbs-up on
  something else, or "looks good" mid-discussion is **not** approval to write.
- **Freeze between approval and writing.** Once approved, do not touch the file
  — no reformatting, no "while I'm here" tidy-ups, no regenerating it. The bytes
  that get set must be the bytes that were approved.
- If the user asks for *any* change after approving, the draft is re-opened:
  edit the file, show the change, and get approval again. There is no such thing
  as a small change that skips re-approval.

### 6. Apply — set the body, then post the comment

Do these via the GitHub MCP connector, in this order:

1. **Set the issue body** to the exact contents of the approved `new-body.md`.
   Read the file and write its bytes through to the issue — do not regenerate
   the text from memory, reformat it, or edit it in passing.
2. **Post a comment** on the issue noting that the body was updated according to
   the approved changes, linking this session — e.g.:
   `The issue body was updated according to the approved changes in [this session](https://claude.ai/code/session_<current-session-id>).`

---

## Guardrails

- **Never write to the issue before approval.** Drafting happens in local files;
  the live issue body and comments aren't touched until phase 6, after phase 5.
- **Approve means verbatim.** Don't improve, reflow, or fix typos in the
  approved `new-body.md` without re-approval, even if the change seems obviously
  good.
- **Cut waffle, not substance.** Trimming repetition, vagueness, and
  contradictions is the job — but every real requirement or piece of intent from
  the original must survive into the refined body. When in doubt about whether
  something is waffle or substance, raise it in the discussion rather than
  dropping it. The original is preserved in `original-body.md` regardless.
- **Don't invent facts about the repo.** Cite files you read; label inferences
  as assumptions.
- **Respect the project's conventions.** An existing issue template or
  contribution guide outranks your preferred structure.
- **Missing label → ask.** Don't assume an unlabeled issue is in scope.
- **One issue at a time** unless the user explicitly asks to batch.
