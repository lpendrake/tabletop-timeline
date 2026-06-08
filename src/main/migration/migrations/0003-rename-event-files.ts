import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { Migration } from '../migration.js';
import { appendMigrationLog } from '../migration-log.js';
import { MATTER_OPTS } from '../../matter-opts.js';
import { createCalendar, golarionSpec } from '../../../shared/calendar/index.js';

const EVENTS_SUBDIR = 'timeline';
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+\.md$/;

// New scheme: YYYY-DDD[Thhmmss]-<slug>.md
// Matches: year (4+ digits), dash, exactly 3 digits (day-of-year)
const NEW_SCHEME_RE = /^-?\d{4,}-\d{3}(?:T\d{6})?-/;

// Old scheme prefix: YYYY-MM-DD or YYYY-MM-DDTHHMMSS or YYYY-MM-DDTHH:MM:SS
// The slug is everything after the date prefix (and the following dash).
const OLD_SCHEME_PREFIX_RE = /^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2}))?-(.+)$/;

const cal = createCalendar(golarionSpec);

function buildNewFilename(epochSeconds: number, slug: string): string {
  const d = cal.fromEpochSeconds(epochSeconds);

  if (d.kind === 'intercalary') {
    throw new Error(
      `0003-rename-event-files: cannot build filename for intercalary date (epochSeconds=${epochSeconds})`,
    );
  }

  const absYear = Math.abs(d.year);
  const year = (d.year < 0 ? '-' : '') + String(absYear).padStart(4, '0');
  const doy = String(cal.dayOfYear(d)).padStart(3, '0');

  const hasTime = d.hour !== 0 || d.minute !== 0 || d.second !== 0;
  if (hasTime) {
    const hh = String(d.hour).padStart(2, '0');
    const mm = String(d.minute).padStart(2, '0');
    const ss = String(d.second).padStart(2, '0');
    return `${year}-${doy}T${hh}${mm}${ss}-${slug}`;
  }

  return `${year}-${doy}-${slug}`;
}

export const renameEventFilesMigration: Migration = {
  name: 'Rename event files to day-of-year scheme',
  targetVersion: 3,
  run: (campaignPath, onProgress) => {
    const eventsDir = path.join(campaignPath, EVENTS_SUBDIR);

    const eventFiles: string[] = fs.existsSync(eventsDir)
      ? fs.readdirSync(eventsDir).filter((f) => SAFE_FILENAME_RE.test(f))
      : [];

    const total = eventFiles.length;
    let completed = 0;
    let renameCount = 0;

    for (const filename of eventFiles) {
      // Already in new scheme — skip (idempotent)
      if (NEW_SCHEME_RE.test(filename)) {
        completed++;
        onProgress(completed, total);
        continue;
      }

      // Read epochSeconds from frontmatter (must be present after migration 0002)
      const filePath = path.join(eventsDir, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(raw, MATTER_OPTS);

      if (data.epochSeconds === undefined) {
        throw new Error(
          `0003-rename-event-files: event file "${filename}" has no "epochSeconds" field — run migration 0002 first`,
        );
      }

      const epochSeconds = Number(data.epochSeconds);

      // Extract the slug from the old filename.
      // Old format: YYYY-MM-DD-<slug>.md or YYYY-MM-DDTHH:MM:SS-<slug>.md
      // Strip .md first, then match.
      const stem = filename.slice(0, -3); // remove .md
      const match = OLD_SCHEME_PREFIX_RE.exec(stem);
      if (!match) {
        throw new Error(`0003-rename-event-files: cannot parse old filename format "${filename}"`);
      }

      const slug = match[7]; // everything after the date prefix dash
      const newFilename = buildNewFilename(epochSeconds, slug) + '.md';

      if (!SAFE_FILENAME_RE.test(newFilename)) {
        throw new Error(
          `0003-rename-event-files: generated filename "${newFilename}" fails safety check`,
        );
      }

      const newFilePath = path.join(eventsDir, newFilename);
      if (fs.existsSync(newFilePath)) {
        throw new Error(
          `0003-rename-event-files: target filename "${newFilename}" already exists — collision detected`,
        );
      }

      fs.renameSync(filePath, newFilePath);

      appendMigrationLog(campaignPath, '0003-rename-event-files', {
        renameFile: {
          oldPath: path.join(EVENTS_SUBDIR, filename),
          newPath: path.join(EVENTS_SUBDIR, newFilename),
        },
      });

      renameCount++;
      completed++;
      onProgress(completed, total);
    }

    if (renameCount === 0) {
      return 'no changes';
    }

    return `renamed ${renameCount} event file${renameCount === 1 ? '' : 's'}`;
  },
};
