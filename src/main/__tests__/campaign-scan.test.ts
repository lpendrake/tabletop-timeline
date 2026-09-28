import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { trashItem: vi.fn() },
}));

// vi.spyOn can't redefine a live ESM named export, so count reads by
// wrapping the real implementation instead.
let readFileSyncCalls = 0;
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const countedReadFileSync = (...args: Parameters<typeof actual.readFileSync>) => {
    readFileSyncCalls++;
    return actual.readFileSync(...args);
  };
  return { ...actual, readFileSync: countedReadFileSync };
});

import { buildEntityIndex } from '../entity-index.js';
import { buildRelationshipIndex } from '../relationships-index.js';
import { getRelationshipsStore } from '../relationships-store.js';
import type { RelationshipFileInput } from '../relationships-store.js';

const EMPTY_LIBRARY = { custom: [], optionAdditions: {} };

const NOTE_DIRECTIVE =
  "{{rp01.set Rep set: {holder:[[c3d4]]}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:attacked}}}";
const EVENT_DIRECTIVE =
  '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked}}}';

const tmpDirs: string[] = [];

function campaign(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-campaign-scan-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'timeline'), { recursive: true });
  return dir;
}

function writeFile(campaignDir: string, relPath: string, content: string): void {
  const full = path.join(campaignDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function seedCampaign(dir: string): void {
  writeFile(
    dir,
    'notes/hero.md',
    `---\nid: a1b2\ntitle: Hero\ntags:\n  - pc\n---\n\nA note about the hero.\n`,
  );
  writeFile(dir, 'notes/villain.md', `---\nid: c3d4\ntitle: Villain\n---\n\n${NOTE_DIRECTIVE}\n`);
  writeFile(
    dir,
    'timeline/0001-001-battle.md',
    `---\nid: ev01\ntitle: Battle of Dawn\nepochSeconds: 500\n---\n\n${EVENT_DIRECTIVE}\n`,
  );
}

function knownNotesFrom(entityIndex: ReturnType<typeof buildEntityIndex>) {
  return entityIndex.filter((e) => e.type === 'note').map((e) => ({ path: e.path, id: e.id }));
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
  getRelationshipsStore().clear();
  readFileSyncCalls = 0;
});

describe('campaign open reads each note and event once', () => {
  it('calls fs.readFileSync exactly once per file across the entity and relationship scans', () => {
    const dir = campaign();
    seedCampaign(dir);
    readFileSyncCalls = 0;

    const relationshipInputs: RelationshipFileInput[] = [];
    const entityIndex = buildEntityIndex(dir, undefined, relationshipInputs);
    const mdReadsAfterEntityScan = readFileSyncCalls;

    // Exactly one read per .md file (2 notes + 1 event) during the entity scan.
    expect(mdReadsAfterEntityScan).toBe(3);

    const knownNotes = knownNotesFrom(entityIndex);
    buildRelationshipIndex(dir, EMPTY_LIBRARY, knownNotes, undefined, relationshipInputs);

    // The relationship-index task derives everything from what the entity
    // scan already collected — no additional reads.
    expect(readFileSyncCalls).toBe(mdReadsAfterEntityScan);
  });

  it('produces the same entity index with or without relationship-input collection', () => {
    const dir = campaign();
    seedCampaign(dir);

    const plain = buildEntityIndex(dir);
    const relationshipInputs: RelationshipFileInput[] = [];
    const withCollection = buildEntityIndex(dir, undefined, relationshipInputs);

    expect(withCollection).toEqual(plain);
  });

  it("builds an identical relationship store from the entity scan's collected inputs as from a fresh disk scan", () => {
    const dir = campaign();
    seedCampaign(dir);

    // Path A: single combined scan (what campaign:open now does).
    const relationshipInputs: RelationshipFileInput[] = [];
    const entityIndex = buildEntityIndex(dir, undefined, relationshipInputs);
    const knownNotes = knownNotesFrom(entityIndex);
    const summaryFromScan = buildRelationshipIndex(
      dir,
      EMPTY_LIBRARY,
      knownNotes,
      undefined,
      relationshipInputs,
    );
    const ledgersFromScan = getRelationshipsStore().ledgers();
    const invalidFromScan = getRelationshipsStore().invalid();
    getRelationshipsStore().clear();

    // Path B: the old standalone scan, reading the campaign itself.
    const summaryFromDisk = buildRelationshipIndex(dir, EMPTY_LIBRARY, knownNotes);
    const ledgersFromDisk = getRelationshipsStore().ledgers();
    const invalidFromDisk = getRelationshipsStore().invalid();

    expect(summaryFromScan).toBe(summaryFromDisk);
    expect(ledgersFromScan).toEqual(ledgersFromDisk);
    expect(invalidFromScan).toEqual(invalidFromDisk);
  });

  it('collects relationship inputs matching readRelationshipFileInput for the same files', async () => {
    const dir = campaign();
    seedCampaign(dir);
    const { readRelationshipFileInput } = await import('../relationships-index.js');

    const relationshipInputs: RelationshipFileInput[] = [];
    buildEntityIndex(dir, undefined, relationshipInputs);

    const byPath = new Map(relationshipInputs.map((i) => [i.path, i]));
    expect(byPath.get('notes/hero.md')).toEqual(readRelationshipFileInput(dir, 'notes/hero.md'));
    expect(byPath.get('notes/villain.md')).toEqual(
      readRelationshipFileInput(dir, 'notes/villain.md'),
    );
    expect(byPath.get('timeline/0001-001-battle.md')).toEqual(
      readRelationshipFileInput(dir, 'timeline/0001-001-battle.md'),
    );
  });
});
