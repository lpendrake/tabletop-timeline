#!/usr/bin/env bash
# PreToolUse hook for the GitHub PR create/update MCP tools: block AI attribution
# in the PR title or body (the "Generated with Claude Code" footer, claude.ai
# session links, or co-author/session trailers). Enforces the CLAUDE.md rule for
# PR descriptions the same way block-commit-attribution.sh does for commits —
# important because a squash-merge configured to use the PR title+description
# would otherwise carry that attribution into the commit on main.
#
# Exit code 2 => stderr is returned to the model as the block reason.

set -euo pipefail

input=$(cat)

# Concatenate the PR title + body from the tool arguments.
payload=$(printf '%s' "$input" | python3 -c '
import json, sys
d = json.load(sys.stdin)
ti = d.get("tool_input", {}) or {}
print((ti.get("title", "") or "") + "\n" + (ti.get("body", "") or ""))
' 2>/dev/null || printf '')

if printf '%s' "$payload" | grep -Eiq \
    'generated with claude code|claude\.com/claude-code|claude\.ai/code/session|Co-Authored-By:|Claude-Session:'; then
  echo "Blocked by repo policy (CLAUDE.md 'No AI attribution trailers'): the PR title/body must not contain Claude Code attribution — the 'Generated with Claude Code' footer, claude.ai/code session links, or co-author/session trailers. Re-submit the PR without them (this matters because a squash-merge using the PR description would pull that attribution into main)." >&2
  exit 2
fi

exit 0
