import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Ledger } from '../../../../shared/relationships';

const state = vi.hoisted(() => ({
  onChangedCbs: [] as Array<() => void>,
}));
const getAllLedgers = vi.hoisted(() => vi.fn<() => Promise<Ledger[]>>());

vi.mock('../../data', () => ({
  relationshipsData: {
    getAllLedgers: () => getAllLedgers(),
    onChanged: (cb: () => void) => {
      state.onChangedCbs.push(cb);
      return () => {
        state.onChangedCbs = state.onChangedCbs.filter((c) => c !== cb);
      };
    },
  },
}));

import { createLedgerSnapshot } from '../ledger-snapshot';

const LEDGERS: Ledger[] = [];

function fireChange() {
  for (const cb of [...state.onChangedCbs]) cb();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('createLedgerSnapshot', () => {
  beforeEach(() => {
    getAllLedgers.mockReset();
    getAllLedgers.mockResolvedValue(LEDGERS);
    state.onChangedCbs = [];
  });

  it('fetches once across repeated calls', async () => {
    const snapshot = createLedgerSnapshot();
    await snapshot.all();
    await snapshot.all();
    expect(getAllLedgers).toHaveBeenCalledTimes(1);
  });

  it('does not fetch until first asked', () => {
    createLedgerSnapshot();
    expect(getAllLedgers).not.toHaveBeenCalled();
  });

  it('does not listen to relationship changes until listen() is called', () => {
    createLedgerSnapshot();
    expect(state.onChangedCbs).toHaveLength(0);
  });

  it('concurrent calls share one fetch', async () => {
    const snapshot = createLedgerSnapshot();
    const first = snapshot.all();
    const second = snapshot.all();
    expect(getAllLedgers).toHaveBeenCalledTimes(1);
    await expect(Promise.all([first, second])).resolves.toEqual([LEDGERS, LEDGERS]);
    expect(getAllLedgers).toHaveBeenCalledTimes(1);
  });

  it('refetches after the relationship index changes while listening', async () => {
    const snapshot = createLedgerSnapshot();
    snapshot.listen();
    await snapshot.all();
    fireChange();
    await snapshot.all();
    expect(getAllLedgers).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache when no listener is attached', async () => {
    const snapshot = createLedgerSnapshot();
    await snapshot.all();
    fireChange();
    await snapshot.all();
    expect(getAllLedgers).toHaveBeenCalledTimes(1);
  });

  it('a change during an in-flight fetch makes the next call refetch', async () => {
    const snapshot = createLedgerSnapshot();
    snapshot.listen();
    const firstFetch = deferred<Ledger[]>();
    const secondFetch = deferred<Ledger[]>();
    const secondResult: Ledger[] = [];
    getAllLedgers.mockReturnValueOnce(firstFetch.promise);
    getAllLedgers.mockReturnValueOnce(secondFetch.promise);

    const firstCall = snapshot.all();
    fireChange();
    const secondCall = snapshot.all();
    expect(getAllLedgers).toHaveBeenCalledTimes(2);

    firstFetch.resolve(LEDGERS);
    await expect(firstCall).resolves.toBe(LEDGERS);

    secondFetch.resolve(secondResult);
    await expect(secondCall).resolves.toBe(secondResult);

    await expect(snapshot.all()).resolves.toBe(secondResult);
    expect(getAllLedgers).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed fetch', async () => {
    getAllLedgers.mockRejectedValueOnce(new Error('ipc down'));
    const snapshot = createLedgerSnapshot();
    await expect(snapshot.all()).rejects.toThrow('ipc down');
    await expect(snapshot.all()).resolves.toBe(LEDGERS);
    expect(getAllLedgers).toHaveBeenCalledTimes(2);
  });

  it('stops listening once the returned unsubscribe runs', () => {
    const snapshot = createLedgerSnapshot();
    const unsubscribe = snapshot.listen();
    expect(state.onChangedCbs).toHaveLength(1);
    unsubscribe();
    expect(state.onChangedCbs).toHaveLength(0);
  });
});
