import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { trashItem: vi.fn() },
}));

import { buildRelationshipIndex, readRelationshipFileInput } from '../relationships-index.js';
import { getRelationshipsStore } from '../relationships-store.js';

const EMPTY_LIBRARY = { custom: [], optionAdditions: {} };

const tmpDirs: string[] = [];

function makeCampaign(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-rel-index-test-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'timeline'), { recursive: true });
  return dir;
}

function writeNote(campaignPath: string, relPath: string, body: string): void {
  const full = path.join(campaignPath, 'notes', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `---\nid: n001\ntitle: Note\n---\n# Note\n\n${body}\n`, 'utf-8');
}

function writeEvent(
  campaignPath: string,
  filename: string,
  epochSeconds: number | null,
  body: string,
): void {
  const fm = epochSeconds === null ? 'title: Event' : `title: Event\nepochSeconds: ${epochSeconds}`;
  fs.writeFileSync(
    path.join(campaignPath, 'timeline', filename),
    `---\n${fm}\n---\n# Event\n\n${body}\n`,
    'utf-8',
  );
}

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
  getRelationshipsStore().clear();
});

const DIRECTIVE =
  '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked}}}';
// A note has no order, so only Set/Add are allowed there — Change (adjust) is event-only.
const NOTE_DIRECTIVE =
  "{{rp01.set Rep set: {holder:[[c3d4]]}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:attacked}}}";

describe('open, close and reopen carries no state over', () => {
  it("holds only the currently-open campaign's data", () => {
    const campaignA = makeCampaign();
    writeNote(campaignA, 'a.md', NOTE_DIRECTIVE);
    buildRelationshipIndex(campaignA, EMPTY_LIBRARY, [
      { path: 'notes/a1b2.md', id: 'a1b2' },
      { path: 'notes/c3d4.md', id: 'c3d4' },
    ]);
    expect(getRelationshipsStore().ledgers().length).toBeGreaterThan(0);

    // simulate campaign:close
    getRelationshipsStore().clear();
    expect(getRelationshipsStore().ledgers()).toHaveLength(0);

    const campaignB = makeCampaign();
    // no directives in campaign B at all
    buildRelationshipIndex(campaignB, EMPTY_LIBRARY, []);
    expect(getRelationshipsStore().ledgers()).toHaveLength(0);
    expect(getRelationshipsStore().invalid()).toHaveLength(0);
  });
});

describe('invalid directives are retained and surfaced in load messages', () => {
  it('mentions the unknown track id in the returned summary', () => {
    const campaign = makeCampaign();
    const badDirective =
      '{{rp99.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}';
    writeNote(campaign, 'bad.md', badDirective);

    const summary = buildRelationshipIndex(campaign, EMPTY_LIBRARY, [
      { path: 'notes/a1b2.md', id: 'a1b2' },
      { path: 'notes/c3d4.md', id: 'c3d4' },
    ]);
    expect(summary).toMatch(/rp99/);
    expect(getRelationshipsStore().invalid()).toHaveLength(1);
  });
});

describe('readRelationshipFileInput', () => {
  it('reads a note, returning its frontmatter id and title as isEvent: false', () => {
    const campaign = makeCampaign();
    writeNote(campaign, 'a.md', NOTE_DIRECTIVE);

    const input = readRelationshipFileInput(campaign, 'notes/a.md');
    expect(input.path).toBe('notes/a.md');
    expect(input.isEvent).toBe(false);
    expect(input.noteId).toBe('n001');
    expect(input.title).toBe('Note');
    expect(input.source).toContain(NOTE_DIRECTIVE);
  });

  it('reads an event, returning its epochSeconds and title as isEvent: true', () => {
    const campaign = makeCampaign();
    writeEvent(campaign, '0001-001-e.md', 500, DIRECTIVE);

    const input = readRelationshipFileInput(campaign, 'timeline/0001-001-e.md');
    expect(input.path).toBe('timeline/0001-001-e.md');
    expect(input.isEvent).toBe(true);
    expect(input.epochSeconds).toBe(500);
    expect(input.title).toBe('Event');
    expect(input.source).toContain(DIRECTIVE);
  });
});

describe('buildRelationshipIndex summary', () => {
  it('counts one directive per source (not per mirror), across notes and dated events', () => {
    const campaign = makeCampaign();
    writeNote(campaign, 'a.md', NOTE_DIRECTIVE);
    writeEvent(campaign, '0001-001-e.md', 500, DIRECTIVE);
    writeEvent(campaign, '0001-002-undated.md', null, DIRECTIVE);

    const summary = buildRelationshipIndex(campaign, EMPTY_LIBRARY, [
      { path: 'notes/a1b2.md', id: 'a1b2' },
      { path: 'notes/c3d4.md', id: 'c3d4' },
    ]);
    expect(summary).toMatch(/^2 relationship directives indexed/);
    expect(summary).toMatch(/no date/i);
  });
});
