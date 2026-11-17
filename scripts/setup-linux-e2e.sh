#!/usr/bin/env bash
# Installs what is needed to launch Electron on a headless Debian/Ubuntu machine:
# Xvfb (virtual display), xauth, and the shared libraries the Electron binary links
# against directly (from `readelf -d node_modules/electron/dist/electron`, mapped to
# packages with `dpkg -S`; their own dependencies come in through apt).
# Only missing packages are installed. Other platforms need nothing and exit 0.

set -euo pipefail

# One entry per line. "a|b" lists alternative names (Ubuntu 24.04 t64 rename first,
# older name second); the first with an apt candidate is used. The order is
# load-bearing: on 24.04 the old names are only virtual packages, so the t64 name has
# to be tried first to pick the real package.
# fonts-liberation: xvfb pulls in no fonts, so without one every screenshot is tofu.
PACKAGES='
xvfb
fonts-liberation
xauth
libasound2t64|libasound2
libatk-bridge2.0-0t64|libatk-bridge2.0-0
libatk1.0-0t64|libatk1.0-0
libatspi2.0-0t64|libatspi2.0-0
libcairo2
libcups2t64|libcups2
libdbus-1-3
libexpat1
libgbm1
libglib2.0-0t64|libglib2.0-0
libgtk-3-0t64|libgtk-3-0
libnspr4
libnss3
libudev1
libpango-1.0-0
libx11-6
libxcb1
libxcomposite1
libxdamage1
libxext6
libxfixes3
libxkbcommon0
libxrandr2
'

if [[ "$(uname -s)" != "Linux" ]] || ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg >/dev/null 2>&1; then
  echo "setup-linux-e2e: nothing to do here; on Linux without apt, install Xvfb, xauth and Electron's runtime libraries (GTK 3, NSS, ALSA, GBM, X11) manually."
  exit 0
fi

has_candidate() {
  local candidate
  candidate=$(apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ {print $2}')
  [[ -n "$candidate" && "$candidate" != "(none)" ]]
}

# `dpkg -s` also succeeds for removed packages whose config files remain.
is_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

# Fills `missing` with the package to install for each entry that has no installed
# alternative, and `unresolved` with entries that have no installable alternative.
resolve_missing() {
  local entry name chosen
  local -a names
  missing=()
  unresolved=()
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    IFS='|' read -ra names <<<"$entry"
    chosen=""
    for name in "${names[@]}"; do
      if is_installed "$name"; then chosen="installed"; break; fi
    done
    [[ "$chosen" == "installed" ]] && continue
    for name in "${names[@]}"; do
      if has_candidate "$name"; then chosen="$name"; break; fi
    done
    if [[ -n "$chosen" ]]; then missing+=("$chosen"); else unresolved+=("$entry"); fi
  done <<<"$PACKAGES"
}

resolve_missing

if [[ ${#missing[@]} -eq 0 && ${#unresolved[@]} -eq 0 ]]; then
  echo "setup-linux-e2e: nothing to install"
  exit 0
fi

as_root=()
if [[ "$(id -u)" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "setup-linux-e2e: packages are missing, this is not root and sudo is unavailable; rerun as root." >&2
    exit 1
  fi
  as_root=(sudo)
fi

# The package index may be stale or empty, so refresh it and resolve again. A broken
# third-party source must not abort here: the unresolved check below decides.
if ! "${as_root[@]}" apt-get -o DPkg::Lock::Timeout=60 update -qq; then
  echo "setup-linux-e2e: warning: apt-get update failed, continuing with the existing package index" >&2
fi
resolve_missing
if [[ ${#unresolved[@]} -gt 0 ]]; then
  echo "setup-linux-e2e: no apt candidate for: ${unresolved[*]}" >&2
  exit 1
fi

"${as_root[@]}" env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=60 install -y --no-install-recommends "${missing[@]}"
echo "setup-linux-e2e: installed: ${missing[*]}"
