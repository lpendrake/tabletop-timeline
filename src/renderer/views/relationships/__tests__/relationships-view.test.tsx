// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Ledger } from '../../../../shared/relationships';

const state = vi.hoisted(() => ({ ledgers: [] as unknown[] }));

vi.mock('../../../relationships/data', () => ({
  relationshipsData: {
    getAllLedgers: () => Promise.resolve(state.ledgers),
    getInvalid: () => Promise.resolve([]),
    getTitles: () => Promise.resolve({}),
    getDefaultHolder: () => Promise.resolve(null),
    onDefaultHolderChanged: () => () => {},
    onChanged: () => () => {},
  },
}));

vi.mock('../../../relationships/view-order-data', async () => {
  const domain = await vi.importActual<typeof import('../../../relationships/domain')>(
    '../../../relationships/domain',
  );
  return {
    viewOrderData: {
      load: () => Promise.resolve(domain.defaultViewOrder()),
      save: () => Promise.resolve(),
    },
  };
});

vi.mock('../../../timeline/data/ports', () => ({
  timelinePort: { getState: vi.fn().mockResolvedValue({ in_game_now_seconds: 100 }) },
}));

import { RelationshipsView } from '../relationships-view';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  state.ledgers = [
    {
      holder: 'aaaa',
      observer: 'bbbb',
      track: 'rp01',
      deltas: [{ op: 'adjust', by: 5, at: 10, declaredIn: { path: 'notes/a.md', ordinal: 0 } }],
    } satisfies Ledger,
  ];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RelationshipsView (temporary shell)', () => {
  it('renders a tab per track and the rows of the active track', async () => {
    act(() =>
      root.render(
        <RelationshipsView
          campaignPath="/camp"
          entityLabelMap={new Map([['bbbb', 'Anna']])}
          getEntityIndex={() => []}
          onOpenById={() => {}}
          onOpenEvent={() => {}}
        />,
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toContain('PF2E Reputation');
    expect(container.textContent).toContain('Anna');
  });
});
