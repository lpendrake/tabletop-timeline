import { describe, it, expect } from 'vitest';
import { notesToPickerOptions } from '../note-picker-options';
import type { EntityIndexEntry } from '../../../../types/global';

describe('notesToPickerOptions', () => {
  it('keeps only notes, mapping to picker options with the effective label', () => {
    const entityIndex: EntityIndexEntry[] = [
      { id: 'n1', path: 'notes/a.md', title: 'Alpha', type: 'note' },
      { id: 'e1', path: 'timeline/e.md', title: 'Event', type: 'event' },
      { id: 'n2', path: 'notes/b.md', title: 'Beta', type: 'note', linkLabelOverride: 'B' },
    ];

    expect(notesToPickerOptions(entityIndex)).toEqual([
      { id: 'n1', path: 'notes/a.md', label: 'Alpha' },
      { id: 'n2', path: 'notes/b.md', label: 'B' },
    ]);
  });

  it('returns an empty array when there are no notes', () => {
    expect(notesToPickerOptions([])).toEqual([]);
  });
});
