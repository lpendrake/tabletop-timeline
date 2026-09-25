import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { addOption, readTrackLibrary, writeTrackLibrary } from '../relationship-tracks.js';
import { PF2E_REPUTATION_ID, RELATIONSHIP_TAGS_ID } from '../../../shared/relationships/index.js';
import type { CategoricalTrackSpec } from '../../../shared/relationships/index.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-tracks-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('readTrackLibrary', () => {
  it('returns built-ins only (empty custom/optionAdditions) when the file is absent', () => {
    const dir = makeTmpDir();
    expect(readTrackLibrary(dir)).toEqual({ custom: [], optionAdditions: {} });
  });

  it('returns built-ins only when the file is malformed', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'relationship-tracks.json'), 'not json');
    expect(readTrackLibrary(dir)).toEqual({ custom: [], optionAdditions: {} });
  });

  it('drops a custom entry missing required shape rather than throwing', () => {
    const dir = makeTmpDir();
    const raw = {
      custom: [
        // Missing `actions` entirely.
        { kind: 'categorical', id: 'bad1', name: 'Bad Track', options: [] },
        // Categorical missing `options`.
        { kind: 'categorical', id: 'bad2', name: 'Bad Track 2', actions: [] },
        // Well-formed — should survive filtering.
        { kind: 'categorical', id: 'good', name: 'Good Track', options: [], actions: [] },
        // Not even an object.
        'garbage',
      ],
      optionAdditions: {
        [RELATIONSHIP_TAGS_ID]: [
          { key: 'ok', label: 'ok', mutual: false },
          { key: 'missing-mutual', label: 'x' }, // dropped: no `mutual`
          'garbage',
        ],
      },
    };
    fs.writeFileSync(path.join(dir, 'relationship-tracks.json'), JSON.stringify(raw));

    const library = readTrackLibrary(dir);
    expect(library.custom.map((t) => t.id)).toEqual(['good']);
    expect(library.optionAdditions[RELATIONSHIP_TAGS_ID]).toEqual([
      { key: 'ok', label: 'ok', mutual: false },
    ]);
  });

  it('round-trips a written library', () => {
    const dir = makeTmpDir();
    const custom: CategoricalTrackSpec = {
      kind: 'categorical',
      id: 'cst1',
      name: 'Custom Track',
      options: [{ key: 'ally', label: 'Ally', mutual: true }],
      actions: [],
    };
    writeTrackLibrary(dir, { custom: [custom], optionAdditions: {} });
    expect(readTrackLibrary(dir)).toEqual({ custom: [custom], optionAdditions: {} });
  });
});

describe('addOption', () => {
  it('appends a new option to a system track under optionAdditions, with a unique kebab-case key', () => {
    const dir = makeTmpDir();
    const result = addOption(dir, RELATIONSHIP_TAGS_ID, { label: 'Blood Rivals', mutual: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option).toEqual({ key: 'blood-rivals', label: 'Blood Rivals', mutual: true });

    const library = readTrackLibrary(dir);
    expect(library.optionAdditions[RELATIONSHIP_TAGS_ID]).toEqual([
      { key: 'blood-rivals', label: 'Blood Rivals', mutual: true },
    ]);
    // Custom tracks are untouched for a system track addition.
    expect(library.custom).toEqual([]);
  });

  it('de-duplicates keys against existing built-in and previously-added options', () => {
    const dir = makeTmpDir();
    // 'married' already exists as a built-in option on tg01.
    const first = addOption(dir, RELATIONSHIP_TAGS_ID, { label: 'married', mutual: true });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.option.key).toBe('married-2');

    const second = addOption(dir, RELATIONSHIP_TAGS_ID, { label: 'married', mutual: true });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.option.key).toBe('married-3');
  });

  it('appends a new option to a custom track directly on its own options list', () => {
    const dir = makeTmpDir();
    const custom: CategoricalTrackSpec = {
      kind: 'categorical',
      id: 'cst1',
      name: 'Custom Track',
      options: [{ key: 'ally', label: 'Ally', mutual: false }],
      actions: [],
    };
    writeTrackLibrary(dir, { custom: [custom], optionAdditions: {} });

    const result = addOption(dir, 'cst1', { label: 'Rival', mutual: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.option).toEqual({ key: 'rival', label: 'Rival', mutual: false });

    const library = readTrackLibrary(dir);
    const track = library.custom.find((t) => t.id === 'cst1') as CategoricalTrackSpec;
    expect(track.options.map((o) => o.key)).toEqual(['ally', 'rival']);
    expect(library.optionAdditions['cst1']).toBeUndefined();
  });

  it('rejects an unknown track id', () => {
    const dir = makeTmpDir();
    const result = addOption(dir, 'zzzz', { label: 'X', mutual: false });
    expect(result).toEqual({ ok: false, reason: 'unknown-track' });
  });

  it('rejects a non-categorical track', () => {
    const dir = makeTmpDir();
    const result = addOption(dir, PF2E_REPUTATION_ID, { label: 'X', mutual: false });
    expect(result).toEqual({ ok: false, reason: 'not-categorical' });
  });
});
