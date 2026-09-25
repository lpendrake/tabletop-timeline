// Works out the version for the next release draft.
//
// Usage: node scripts/next-version.mjs <latest-published-tag> [override]
// Prints the version (no leading "v") to stdout.

import { pathToFileURL } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function stripV(version) {
  return version.trim().replace(/^v/, '');
}

export function nextVersion(latestTag, override) {
  if (override && override.trim() !== '') {
    const version = stripV(override);
    if (!SEMVER.test(version)) throw new Error(`Override "${override}" is not a valid version`);
    return version;
  }

  const latest = stripV(latestTag ?? '');
  const match = SEMVER.exec(latest);
  if (!match) throw new Error(`Latest release tag "${latestTag}" is not a valid version`);

  const [, major, minor, patch, prerelease] = match;
  if (!prerelease) return `${major}.${minor}.${Number(patch) + 1}`;

  const parts = prerelease.split('.');
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) parts[parts.length - 1] = String(Number(last) + 1);
  else parts.push('1');
  return `${major}.${minor}.${patch}-${parts.join('.')}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(nextVersion(process.argv[2], process.argv[3]));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
