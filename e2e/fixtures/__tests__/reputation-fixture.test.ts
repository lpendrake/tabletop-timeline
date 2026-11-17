import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { trashItem: vi.fn() },
}));

import { buildRelationshipIndex } from '../../../src/main/relationships-index.js';
import { getRelationshipsStore } from '../../../src/main/relationships-store.js';
import { LATEST_VERSION } from '../../../src/main/migration/registry.js';
import { buildNewFilename } from '../../../src/main/migration/migrations/0003-rename-event-files.js';
import {
  ALL_HOLDERS,
  ledgersForHolder,
} from '../../../src/renderer/relationships/domain/holders.js';
import { parseNote } from '../../../src/shared/frontmatter.js';
import {
  EMPTY_TRACK_LIBRARY,
  PF2E_REPUTATION_ID,
  computeValue,
  resolveTrack,
} from '../../../src/shared/relationships/index.js';
import type { Ledger, NumericTrack } from '../../../src/shared/relationships/index.js';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'reputation');
const ID_RE = /^[a-z0-9]{4}$/;
const MIN_ROWS = 30;
const MIN_OBSERVERS = 12;

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE, rel), 'utf-8')) as Record<string, unknown>;
}

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function entityFiles(): string[] {
  return [
    ...markdownFiles(path.join(FIXTURE, 'notes')),
    ...markdownFiles(path.join(FIXTURE, 'timeline')),
  ];
}

function noteIds(): { path: string; id: string }[] {
  return markdownFiles(path.join(FIXTURE, 'notes')).map((full) => {
    const content = fs.readFileSync(full, 'utf-8');
    const { frontmatter } = parseNote(content, path.basename(full, '.md'));
    const rel = path.relative(FIXTURE, full).replace(/\\/g, '/');
    return { path: rel, id: frontmatter.id };
  });
}

const track = resolveTrack(PF2E_REPUTATION_ID, EMPTY_TRACK_LIBRARY) as NumericTrack;

let ledgers: Ledger[] = [];
let reputationLedgers: Ledger[] = [];
let now = 0;

beforeAll(() => {
  const state = readJson('timeline/state.json');
  now = state.in_game_now_seconds as number;
  buildRelationshipIndex(FIXTURE, EMPTY_TRACK_LIBRARY, noteIds());
  ledgers = getRelationshipsStore().ledgers();
  reputationLedgers = ledgersForHolder(ledgers, PF2E_REPUTATION_ID, ALL_HOLDERS);
});

afterAll(() => {
  getRelationshipsStore().clear();
});

describe('reputation fixture campaign', () => {
  it('every note and event already has the id, title and heading the app would otherwise write back', () => {
    const files = entityFiles();
    expect(files.length).toBeGreaterThan(0);

    const ids = new Set<string>();
    for (const full of files) {
      const rel = path.relative(FIXTURE, full);
      const { frontmatter, needsWrite } = parseNote(
        fs.readFileSync(full, 'utf-8'),
        path.basename(full, '.md'),
      );
      expect(needsWrite, `${rel} would be rewritten on open`).toBe(false);
      expect(frontmatter.id, `${rel} id`).toMatch(ID_RE);
      expect(ids.has(frontmatter.id), `${rel} duplicates id ${frontmatter.id}`).toBe(false);
      ids.add(frontmatter.id);
    }
  });

  it('every directive parses with no relationship problems', () => {
    expect(getRelationshipsStore().invalid()).toEqual([]);
  });

  it('there are at least two holders and about a dozen observers', () => {
    const holders = new Set(reputationLedgers.map((l) => l.holder));
    const observers = new Set(reputationLedgers.map((l) => l.observer));
    expect(holders.size).toBeGreaterThanOrEqual(2);
    expect(observers.size).toBeGreaterThanOrEqual(MIN_OBSERVERS);
  });

  it('the default reputation holder is one of the holders', () => {
    const holders = new Set(reputationLedgers.map((l) => l.holder));
    expect(holders.has(readJson('settings.json').defaultReputationHolder as string)).toBe(true);
  });

  it('current standings at the fixed in-game now cover all seven PF2E bands', () => {
    const reached = new Set(
      reputationLedgers.map((l) => track.labelFor(computeValue(l, track, now))),
    );
    const allBands = track.bands.map((b) => b.label);
    expect(allBands).toHaveLength(7);
    expect([...reached].sort()).toEqual([...allBands].sort());
  });

  it('at least one change is dated after the in-game now', () => {
    const future = ledgers.flatMap((l) => l.deltas).filter((d) => d.at !== null && d.at > now);
    expect(future.length).toBeGreaterThan(0);
  });

  it('the All holders view has at least 30 rows', () => {
    expect(reputationLedgers.length).toBeGreaterThanOrEqual(MIN_ROWS);
  });

  it('every event filename carries the day of year of its epochSeconds', () => {
    const dir = path.join(FIXTURE, 'timeline');
    const files = markdownFiles(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const full of files) {
      const name = path.basename(full);
      const { frontmatter } = parseNote(fs.readFileSync(full, 'utf-8'), path.basename(full, '.md'));
      const prefix = buildNewFilename(frontmatter.epochSeconds as number, '');
      expect(name.startsWith(prefix), `${name} should start with ${prefix}`).toBe(true);
    }
  });

  it('the campaign is already at the latest migration version', () => {
    expect(readJson('settings.json').version).toBe(LATEST_VERSION);
  });
});
