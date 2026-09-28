import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { TrackLibrary } from '../shared/relationships/index.js';
import { parseNote, extractH1 } from '../shared/frontmatter.js';
import type { NoteFrontmatter } from '../shared/frontmatter.js';
import { SAFE_FILENAME_RE } from './timelineIpcHandlers.js';
import { MATTER_OPTS } from './matter-opts.js';
import {
  getRelationshipsStore,
  type KnownNote,
  type RelationshipFileInput,
} from './relationships-store.js';
import type { InvalidDirectiveEntry } from './relationships-store.js';

/**
 * Builds a note's `RelationshipFileInput` from frontmatter/body already
 * parsed once (e.g. by the entity index's own `parseNote` call) — no extra
 * read or parse needed, since both the entity index and the relationship
 * index derive from the same plain-YAML parse of a note file.
 */
export function relationshipInputFromParsedNote(
  relPath: string,
  frontmatter: NoteFrontmatter,
  body: string,
): RelationshipFileInput {
  return {
    path: relPath,
    source: body,
    title: frontmatter.title,
    isEvent: false,
    noteId: frontmatter.id,
  };
}

/**
 * Builds an event's `RelationshipFileInput` from the file's raw content.
 * Events are parsed with `MATTER_OPTS` (CORE_SCHEMA) rather than the plain
 * engine `parseNote` uses, so date-like frontmatter (a `date` field, a
 * Golarion year) is never silently cast to a JS `Date` — see matter-opts.ts.
 * This is a second, still read-free, in-memory parse of content the caller
 * (the entity index scan, or `readRelationshipFileInput` below) already
 * has in hand — never a second disk read.
 */
export function relationshipInputFromEventContent(
  relPath: string,
  content: string,
): RelationshipFileInput {
  const { data, content: rawBody } = matter(content, MATTER_OPTS);
  const body = rawBody.trimStart();
  const h1 = extractH1(body);
  const title = h1 ?? String(data.title ?? '');
  const epochSeconds = data.epochSeconds !== undefined ? Number(data.epochSeconds) : null;
  return { path: relPath, source: body, title, isEvent: true, epochSeconds };
}

/**
 * Reads one campaign-relative file (a note under `notes/` or an event under
 * `timeline/`) and returns it as a `RelationshipFileInput`. Used by the file
 * watcher (which only ever has one changed file to re-read) and directly in
 * tests. The initial campaign scan does not call this — it reuses the
 * content it already read via `relationshipInputFromParsedNote` /
 * `relationshipInputFromEventContent` instead of reading each file twice.
 */
export function readRelationshipFileInput(
  campaignPath: string,
  relPath: string,
): RelationshipFileInput {
  const full = path.join(campaignPath, relPath);
  const content = fs.readFileSync(full, 'utf-8');

  if (relPath.startsWith('timeline/')) {
    return relationshipInputFromEventContent(relPath, content);
  }

  const fallbackTitle = path.basename(relPath, '.md');
  const { frontmatter, body } = parseNote(content, fallbackTitle);
  return relationshipInputFromParsedNote(relPath, frontmatter, body);
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
 * Rebuilds the relationship store from scratch, from `RelationshipFileInput`s
 * for every note (recursively under `notes/`) and event (flat, under
 * `timeline/`) in the campaign. `knownNotes` seeds the store's known-notes
 * map before any directive is interpreted, so a directive referencing a note
 * resolves correctly regardless of scan order.
 *
 * When `scannedFiles` is provided (the campaign-open path, where the entity
 * index scan already read and parsed every file) those inputs are used
 * as-is and `notes/` / `timeline/` are not walked or read again. Omit it to
 * have this function scan the campaign itself (used directly in tests and by
 * any other standalone caller).
 */
export function buildRelationshipIndex(
  campaignPath: string,
  library: TrackLibrary,
  knownNotes: Iterable<KnownNote>,
  onProgress?: (completed: number, total: number) => void,
  scannedFiles?: RelationshipFileInput[],
): string {
  let files: RelationshipFileInput[];

  if (scannedFiles) {
    files = scannedFiles;
    const total = files.length;
    let completed = 0;
    for (let i = 0; i < files.length; i++) onProgress?.(++completed, total);
  } else {
    const notesDir = path.join(campaignPath, 'notes');
    const timelineDir = path.join(campaignPath, 'timeline');

    const total = countMdFiles(notesDir) + countTimelineFiles(timelineDir);
    let completed = 0;
    const tick = () => onProgress?.(++completed, total);

    files = [];
    if (fs.existsSync(notesDir)) scanNotes(notesDir, notesDir, campaignPath, files, tick);
    scanTimeline(timelineDir, campaignPath, files, tick);
  }

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
