import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDefaultHolder = vi.fn().mockResolvedValue(undefined);
vi.mock('../data', () => ({
  relationshipsData: {
    setDefaultHolder: (...args: unknown[]) => setDefaultHolder(...args),
    addOption: vi.fn(),
  },
}));

import { makeHolderChosenHandler, makeHeldOptionsResolver } from '../editor-host-config';
import {
  relationshipTagsSpec,
  type Ledger,
  type TrackLibrary,
} from '../../../shared/relationships';

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

describe('makeHolderChosenHandler', () => {
  beforeEach(() => {
    setDefaultHolder.mockClear();
  });

  it('offers to make the chosen holder the default; yes saves it', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const labelFor = (id: string) => (id === 'npc-1' ? 'Sera' : id);
    const handler = makeHolderChosenHandler(confirm, labelFor);

    handler('npc-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Make Sera the default reputation holder?' }),
    );
    expect(setDefaultHolder).toHaveBeenCalledWith('npc-1');
  });

  it('does not save when the user declines', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const handler = makeHolderChosenHandler(confirm, (id) => id);

    handler('npc-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(setDefaultHolder).not.toHaveBeenCalled();
  });
});

describe('makeHeldOptionsResolver', () => {
  const trackId = relationshipTagsSpec.id;

  function ledger(deltas: Ledger['deltas']): Ledger {
    return { holder: 'h1', observer: 'o1', track: trackId, deltas };
  }

  it('resolves held options for the (holder, observer, track) ledger as of the given point', async () => {
    const deltas: Ledger['deltas'] = [
      { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
      { op: 'add', key: 'employee', at: null, declaredIn: { path: 'notes/a.md', ordinal: 1 } },
    ];
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      getLedgers: () => [ledger(deltas)],
      currentPath: () => null,
      at: () => null,
    });

    const result = await resolver({ trackId, holder: 'h1', observer: 'o1', anchor: 0, doc: '' });
    expect(result).toEqual(['member', 'employee']);
  });

  it('returns empty when holder or observer is missing', async () => {
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      getLedgers: () => [],
      currentPath: () => null,
      at: () => null,
    });
    expect(await resolver({ trackId, holder: null, observer: 'o1', anchor: 0, doc: '' })).toEqual(
      [],
    );
  });
});
