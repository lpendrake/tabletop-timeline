import { describe, it, expect } from 'vitest';

import { findSetConflicts, setConflictMessage, type BufferUndatedSet } from '../index.js';

const A = 'a1b2';
const C = 'c3d4';
const D = 'd5e6';

function bufferSet(ordinal: number, holder = A, observer = C, trackId = 'rp01'): BufferUndatedSet {
  return { ordinal, holder, observer, trackId };
}

describe('findSetConflicts', () => {
  it('flags two Sets in the same buffer for the same relationship', () => {
    const conflicts = findSetConflicts([bufferSet(0), bufferSet(1)]);

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.ordinal).sort()).toEqual([0, 1]);
    for (const c of conflicts) {
      expect(c.duplicateInBuffer).toBe(true);
      expect(c.externalPaths).toEqual([]);
    }
  });

  it('flags a buffer Set that conflicts with an undated Set declared in another saved file', () => {
    const conflicts = findSetConflicts(
      [bufferSet(0)],
      [{ holder: A, observer: C, trackId: 'rp01', path: 'notes/other.md' }],
    );

    expect(conflicts).toEqual([
      { ordinal: 0, duplicateInBuffer: false, externalPaths: ['notes/other.md'] },
    ]);
  });

  it('dedupes external paths and reports both in-buffer duplication and cross-file conflict together', () => {
    const conflicts = findSetConflicts(
      [bufferSet(0), bufferSet(1)],
      [
        { holder: A, observer: C, trackId: 'rp01', path: 'notes/other.md' },
        { holder: A, observer: C, trackId: 'rp01', path: 'notes/other.md' },
      ],
    );

    expect(conflicts).toHaveLength(2);
    for (const c of conflicts) {
      expect(c.duplicateInBuffer).toBe(true);
      expect(c.externalPaths).toEqual(['notes/other.md']);
    }
  });

  it('does not conflict when the holder/observer/track triple differs', () => {
    const conflicts = findSetConflicts([bufferSet(0, A, C), bufferSet(1, A, D)]);

    expect(conflicts).toEqual([]);
  });

  it('does not conflict when there is nothing else in the buffer or externally', () => {
    const conflicts = findSetConflicts([bufferSet(0)]);

    expect(conflicts).toEqual([]);
  });
});

describe('setConflictMessage', () => {
  it('names the other note by title when known, falling back to its path', () => {
    const titled = setConflictMessage(
      { duplicateInBuffer: false, externalPaths: ['notes/other.md'] },
      (path) => (path === 'notes/other.md' ? 'The Party' : undefined),
    );
    expect(titled).toBe('Only one note may set this relationship; also set in The Party');

    const untitled = setConflictMessage(
      { duplicateInBuffer: false, externalPaths: ['notes/other.md'] },
      () => undefined,
    );
    expect(untitled).toBe('Only one note may set this relationship; also set in notes/other.md');
  });

  it('mentions same-buffer duplication distinctly', () => {
    const message = setConflictMessage(
      { duplicateInBuffer: true, externalPaths: [] },
      () => undefined,
    );
    expect(message).toBe(
      'Only one note may set this relationship; set more than once in this note',
    );
  });

  it('combines both when a Set is duplicated in the buffer and conflicts externally', () => {
    const message = setConflictMessage(
      { duplicateInBuffer: true, externalPaths: ['notes/other.md'] },
      () => 'The Party',
    );
    expect(message).toBe(
      'Only one note may set this relationship; also set in The Party; set more than once in this note',
    );
  });
});
