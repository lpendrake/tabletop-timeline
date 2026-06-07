import * as fs from 'node:fs';
import * as path from 'node:path';

/** One logged action, e.g. { renameFile: { oldPath: 'events/a.md', newPath: 'events/b.md' } }. */
export type MigrationLogEntry = Record<string, Record<string, string | number | boolean | object>>;

/**
 * Appends one action entry to `<campaignPath>/migration-log/<logName>.log.json` (NDJSON),
 * creating the `migration-log/` folder if needed.
 *
 * IMPORTANT: callers must pass CAMPAIGN-RELATIVE paths only (e.g. 'events/some-event.md'),
 * never absolute paths or full file contents — keep entries small and root-relative so the
 * log is a safe, debuggable, potentially-reversible record.
 *
 * `logName` should be the migration's file stem, e.g. '0001-sample-migration'.
 */
export function appendMigrationLog(
  campaignPath: string,
  logName: string,
  entry: MigrationLogEntry,
): void {
  const dir = path.join(campaignPath, 'migration-log');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${logName}.log.json`), JSON.stringify(entry) + '\n', 'utf-8');
}
