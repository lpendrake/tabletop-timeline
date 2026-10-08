import { describe, it, expect } from 'vitest';
import { openDeclaringFile, resolveStepOpenTarget } from '../step-open-target';
import type { EntityIndexEntry } from '../../../../types/global';

const entityIndex: EntityIndexEntry[] = [
  { id: 'nnnn', path: 'notes/npcs/elara.md', title: 'Elara', type: 'note' },
];

describe('resolveStepOpenTarget', () => {
  it('resolves a timeline/ path to an event, stripping the prefix', () => {
    expect(resolveStepOpenTarget('timeline/battle.md', entityIndex)).toEqual({
      kind: 'event',
      filename: 'battle.md',
    });
  });

  it('resolves a notes/ path to the note entity id, via the entity index', () => {
    expect(resolveStepOpenTarget('notes/npcs/elara.md', entityIndex)).toEqual({
      kind: 'note',
      entityId: 'nnnn',
    });
  });

  it('is unknown for a notes/ path not present in the entity index', () => {
    expect(resolveStepOpenTarget('notes/npcs/missing.md', entityIndex)).toEqual({
      kind: 'unknown',
    });
  });

  it('is unknown for a path outside notes/ and timeline/', () => {
    expect(resolveStepOpenTarget('other/thing.md', entityIndex)).toEqual({ kind: 'unknown' });
  });
});

describe('openDeclaringFile', () => {
  function run(path: string): string[] {
    const calls: string[] = [];
    openDeclaringFile(path, entityIndex, {
      event: (filename) => calls.push(`event:${filename}`),
      note: (entityId) => calls.push(`note:${entityId}`),
    });
    return calls;
  }

  it('opens a timeline file as an event', () => {
    expect(run('timeline/x.md')).toEqual(['event:x.md']);
  });

  it('opens a notes file as the note entity', () => {
    expect(run('notes/npcs/elara.md')).toEqual(['note:nnnn']);
  });

  it('does nothing for an unknown path', () => {
    expect(run('other/thing.md')).toEqual([]);
    expect(run('notes/npcs/missing.md')).toEqual([]);
  });
});
