import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackLibrary } from '../shared/relationships/index.js';
import { parseNote } from '../shared/frontmatter.js';
import { parseEventFile, SAFE_FILENAME_RE } from './timelineIpcHandlers.js';
import {
  getRelationshipsStore,
  type KnownNote,
  type RelationshipFileInput,
} from './relationships-store.js';
import type { InvalidDirectiveEntry } from './relationships-store.js';

/**
 * Reads one campaign-relative file (a note under `notes/` or an event under
 * `timeline/`) and returns it as a `RelationshipFileInput`, the single shape
 * both the initial campaign scan and the file watcher hand to the store.
 */
export function readRelationshipFileInput(
  campaignPath: string,
  relPath: string,
): RelationshipFileInput {
  const full = path.join(campaignPath, relPath);

  if (relPath.startsWith('timeline/')) {
    const filename = path.basename(relPath);
    const { event } = parseEventFile(full, filename);
    return {
      path: relPath,
      source: event.body,
      title: event.title,
      isEvent: true,
      epochSeconds: event.epochSeconds ?? null,
    };
  }

  const content = fs.readFileSync(full, 'utf-8');
  const fallbackTitle = path.basename(relPath, '.md');
  const { frontmatter, body } = parseNote(content, fallbackTitle);
  return {
    path: relPath,
    source: body,
    title: frontmatter.title,
    isEvent: false,
    noteId: frontmatter.id,
  };
}

function countMdFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countMdFiles(full);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      count++;
    }
  }
  return count;
}

/** Timeline is flat and only ever contains files matching SAFE_FILENAME_RE — matches what scanTimeline actually reads. */
function countTimelineFiles(timelineDir: string): number {
  if (!fs.existsSync(timelineDir)) return 0;
  return fs.readdirSync(timelineDir).filter((f) => SAFE_FILENAME_RE.test(f)).length;
}

function scanNotes(
  currentDir: string,
  baseDir: string,
  campaignPath: string,
  files: RelationshipFileInput[],
  tick: () => void,
): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      scanNotes(full, baseDir, campaignPath, files, tick);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;

    const relPath = `notes/${path.relative(baseDir, full).replace(/\\/g, '/')}`;
    files.push(readRelationshipFileInput(campaignPath, relPath));
    tick();
  }
}

function scanTimeline(
  timelineDir: string,
  campaignPath: string,
  files: RelationshipFileInput[],
  tick: () => void,
): void {
  if (!fs.existsSync(timelineDir)) return;
  for (const filename of fs.readdirSync(timelineDir)) {
    if (!SAFE_FILENAME_RE.test(filename)) continue;
    files.push(readRelationshipFileInput(campaignPath, `timeline/${filename}`));
    tick();
  }
}

const INVALID_LIST_CAP = 5;

function summarizeInvalid(invalid: InvalidDirectiveEntry[]): string {
  const lines = invalid.slice(0, INVALID_LIST_CAP).map((e) => {
    const where = e.ordinal !== undefined ? `${e.path} #${e.ordinal}` : e.path;
    return `${where}: ${e.messages.join('; ')}`;
  });
  if (invalid.length > INVALID_LIST_CAP) {
    lines.push(`...and ${invalid.length - INVALID_LIST_CAP} more`);
  }
  return [
    `${invalid.length} invalid relationship directive${invalid.length === 1 ? '' : 's'}:`,
    ...lines,
  ].join('\n');
}

/**
 * Scans `notes/` (recursively) and `timeline/` (flat) for relationship
 * directives and rebuilds the relationship store from scratch. `knownNotes`
 * seeds the store's known-notes map before any directive is interpreted, so
 * a directive referencing a note resolves correctly regardless of scan order.
 */
export function buildRelationshipIndex(
  campaignPath: string,
  library: TrackLibrary,
  knownNotes: Iterable<KnownNote>,
  onProgress?: (completed: number, total: number) => void,
): string {
  const notesDir = path.join(campaignPath, 'notes');
  const timelineDir = path.join(campaignPath, 'timeline');

  const total = countMdFiles(notesDir) + countTimelineFiles(timelineDir);
  let completed = 0;
  const tick = () => onProgress?.(++completed, total);

  const files: RelationshipFileInput[] = [];
  if (fs.existsSync(notesDir)) scanNotes(notesDir, notesDir, campaignPath, files, tick);
  scanTimeline(timelineDir, campaignPath, files, tick);

  const store = getRelationshipsStore();
  store.seedKnownNotes(knownNotes);
  store.rebuild(files, library);

  const ledgerDirectiveKeys = new Set<string>();
  for (const ledger of store.ledgers()) {
    for (const delta of ledger.deltas) {
      if (delta.mirrored) continue;
      ledgerDirectiveKeys.add(`${delta.declaredIn.path}#${delta.declaredIn.ordinal}`);
    }
  }

  const summaryLine = `${ledgerDirectiveKeys.size} relationship directive${
    ledgerDirectiveKeys.size === 1 ? '' : 's'
  } indexed`;

  const invalid = store.invalid();
  if (invalid.length === 0) return summaryLine;
  return `${summaryLine}\n${summarizeInvalid(invalid)}`;
}
