#!/usr/bin/env bash
# SessionStart hook: make a Claude cloud (Linux) session ready to launch the app.
# Installs the system prerequisites, the npm dependencies and the Electron binary.
# Local sessions are untouched. Stdout is shown to the model only when the hook exits
# 0, so failures are reported on stdout (FAILED line + log tail) and the exit is 0.
# Prints nothing when everything was already in place.

set -euo pipefail

if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" || "$(uname -s)" != "Linux" ]]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

log="${TMPDIR:-/tmp}/tabletop-session-start.log"
step="starting"
summary=()

fail() {
  trap - ERR TERM
  echo "session-start: FAILED at $step — log: $log"
  if [[ -n "${1:-}" ]]; then echo "$1"; fi
  if [[ -n "${log_started:-}" ]]; then tail -n 20 "$log"; else echo "(aborted before any step output was recorded)"; fi
  exit 0
}
trap 'fail' ERR TERM

# The first record of a run replaces the log of earlier runs.
record() {
  if [[ -z "${log_started:-}" ]]; then : >"$log"; log_started=1; fi
  printf '== %s ==\n%s\n' "$step" "$output" >>"$log"
}

# Runs a command and sets `output` to what it printed. The log is created only when
# the command fails or the caller calls `record` because the step did work.
run() {
  local hint=$1 rc=0
  shift
  output=$("$@" 2>&1) || rc=$?
  if [[ $rc -ne 0 ]]; then
    record
    fail "$hint"
  fi
}

step="Linux prerequisites"
run "" scripts/setup-linux-e2e.sh
if [[ "$output" == *"setup-linux-e2e: installed:"* ]]; then
  record
  summary+=("Linux prerequisites installed")
fi

# npm writes node_modules/.package-lock.json at the end of a successful install, so a
# missing file means no install or an interrupted one.
step="npm ci"
if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  run "" npm ci
  record
  summary+=("npm ci done")
fi

# install.js returns quickly when the matching Electron binary is already installed.
step="Electron binary"
run "The Electron download needs network access to github.com (or set ELECTRON_MIRROR)." node node_modules/electron/install.js
if [[ -n "$output" ]]; then
  record
  summary+=("Electron binary installed")
fi

if [[ ${#summary[@]} -gt 0 ]]; then
  printf 'session-start: %s\n' "${summary[@]}"
  echo "session-start: ready (log: $log)"
fi
