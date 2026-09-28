import { describe, it, expect } from 'vitest';
import { externalSetConflictEntries } from '../external-set-conflicts';
import type { ExternalUndatedSet } from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';

function entry(id: string, path: string, title: string): EntityIndexEntry {
  return { id, path, title, type: 'note' };
}

function undated(path: string, holder = 'a1b2', observer = 'c3d4'): ExternalUndatedSet {
  return { trackId: 'rp01', holder, observer, path };
}

describe('externalSetConflictEntries', () => {
  it("excludes the buffer's own saved path — the buffer is the truth for it", () => {
    const all = [undated('notes/this.md'), undated('notes/other.md')];
    const entries = externalSetConflictEntries(all, 'notes/this.md', []);

    expect(entries).toEqual([
      {
        trackId: 'rp01',
        holder: 'a1b2',
        observer: 'c3d4',
        path: 'notes/other.md',
        title: undefined,
      },
    ]);
  });

  it('keeps everything when there is no current path (an unsaved buffer)', () => {
    const all = [undated('notes/other.md')];
    expect(externalSetConflictEntries(all, null, [])).toHaveLength(1);
  });

  it('resolves each entry a title from the entity index by path, when known', () => {
    const all = [undated('notes/other.md'), undated('notes/unknown.md')];
    const entityIndex = [entry('n1', 'notes/other.md', 'The Party')];

    const entries = externalSetConflictEntries(all, null, entityIndex);

    expect(entries.find((e) => e.path === 'notes/other.md')?.title).toBe('The Party');
    expect(entries.find((e) => e.path === 'notes/unknown.md')?.title).toBeUndefined();
  });
});
