#!/usr/bin/env bash
# PreToolUse(Bash) hook: block git commits that embed AI attribution trailers.
#
# Rationale: the remote Claude Code environment instructs the assistant to append
# `Co-Authored-By:` and `Claude-Session:` trailers to commit messages, which
# bypasses the `includeCoAuthoredBy` setting. This hook enforces the CLAUDE.md
# rule deterministically: any commit-creating command whose message carries one
# of those trailers is denied, and the reason is surfaced back to the assistant
# so it re-issues the commit without them.
#
# Exit code 2 => stderr is returned to the model as the block reason.

set -euo pipefail

input=$(cat)

# Extract the Bash command from the PreToolUse payload.
command=$(printf '%s' "$input" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("command",""))' \
  2>/dev/null || printf '')

# (a) Only police commit-creating commands: a `git ... commit` invocation
#     (incl. `git -C <path> commit`, `git commit --amend`, `git commit-tree`).
#     Read-only usage like `git log --grep=Co-Authored-By` has no `commit`
#     token, so it does not match here; and the trailer check in (b) makes any
#     residual false positive practically impossible.
if printf '%s' "$command" | grep -Eq '(^|[;&|(]|[[:space:]])git[[:space:]].*commit'; then
  # (b) Trailer text present (case-insensitive, either trailer).
  if printf '%s' "$command" | grep -Eiq 'Co-Authored-By:|Claude-Session:'; then
    echo "Blocked by repo policy (CLAUDE.md 'No AI attribution trailers'): commit messages must not contain 'Co-Authored-By:' or 'Claude-Session:' trailer lines. Re-run the commit with those lines removed." >&2
    exit 2
  fi
fi

exit 0
