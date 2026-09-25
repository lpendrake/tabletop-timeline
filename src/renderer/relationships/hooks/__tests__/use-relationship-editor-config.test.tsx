// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const state = vi.hoisted(() => ({
  defaultHolderId: null as string | null,
  onDefaultHolderChangedCb: null as ((id: string | null) => void) | null,
}));

vi.mock('../../data', () => ({
  relationshipsData: {
    getDefaultHolder: () => Promise.resolve(state.defaultHolderId),
    onDefaultHolderChanged: (cb: (id: string | null) => void) => {
      state.onDefaultHolderChangedCb = cb;
      return () => {
        state.onDefaultHolderChangedCb = null;
      };
    },
    onChanged: () => () => {},
    getAllLedgers: () => Promise.resolve([]),
  },
}));

import { useRelationshipEditorConfig } from '../use-relationship-editor-config';

let container: HTMLDivElement;
let root: Root;
let lastDefaultHolderId: string | null | undefined;

function Host() {
  const { relationshipDirectives } = useRelationshipEditorConfig({
    entityIndex: [],
    defaultReason: 'Unspecified',
    place: 'event',
    currentPath: () => 'timeline/e.md',
    at: () => 100,
    getDocText: () => '',
    confirm: vi.fn(),
  });
  lastDefaultHolderId = relationshipDirectives.bubbles?.defaultHolderId?.();
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  state.defaultHolderId = null;
  state.onDefaultHolderChangedCb = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useRelationshipEditorConfig default holder refresh', () => {
  it('refreshes on relationshipsData.onDefaultHolderChanged, not only on file changes', async () => {
    act(() => root.render(<Host />));
    await flush();
    expect(lastDefaultHolderId).toBeNull();

    expect(state.onDefaultHolderChangedCb).toBeTruthy();
    act(() => state.onDefaultHolderChangedCb!('npc-1'));
    await flush();

    expect(lastDefaultHolderId).toBe('npc-1');
  });
});
