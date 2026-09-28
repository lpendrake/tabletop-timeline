// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const state = vi.hoisted(() => ({
  defaultHolderId: null as string | null,
  onDefaultHolderChangedCb: null as ((id: string | null) => void) | null,
  onChangedCb: null as (() => void) | null,
  undatedSets: [] as Array<{ trackId: string; holder: string; observer: string; path: string }>,
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
    onChanged: (cb: () => void) => {
      state.onChangedCb = cb;
      return () => {
        state.onChangedCb = null;
      };
    },
    getAllLedgers: () => Promise.resolve([]),
    getUndatedSets: () => Promise.resolve(state.undatedSets),
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
  });
  lastDefaultHolderId = relationshipDirectives.choices?.defaultHolderId?.();
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
  state.onChangedCb = null;
  state.undatedSets = [];
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

let lastExternalSetConflicts:
  | Array<{ trackId: string; holder: string; observer: string; path: string; title?: string }>
  | undefined;

function NoteHost({ currentPath }: { currentPath: string }) {
  const { relationshipDirectives } = useRelationshipEditorConfig({
    entityIndex: [{ id: 'n1', path: 'notes/other.md', title: 'The Party', type: 'note' }],
    defaultReason: 'Unspecified',
    place: 'note',
    currentPath: () => currentPath,
    at: () => null,
    getDocText: () => '',
  });
  lastExternalSetConflicts = relationshipDirectives.externalSetConflicts;
  return null;
}

describe('useRelationshipEditorConfig undated-Set conflicts (note editors only)', () => {
  it("fetches undated Sets, excludes this buffer's own path, and resolves titles from the entity index", async () => {
    state.undatedSets = [
      { trackId: 'rp01', holder: 'a1b2', observer: 'c3d4', path: 'notes/this.md' },
      { trackId: 'rp01', holder: 'a1b2', observer: 'c3d4', path: 'notes/other.md' },
    ];
    act(() => root.render(<NoteHost currentPath="notes/this.md" />));
    await flush();

    expect(lastExternalSetConflicts).toEqual([
      {
        trackId: 'rp01',
        holder: 'a1b2',
        observer: 'c3d4',
        path: 'notes/other.md',
        title: 'The Party',
      },
    ]);
  });

  it('refreshes when relationships change elsewhere (relationshipsData.onChanged)', async () => {
    act(() => root.render(<NoteHost currentPath="notes/this.md" />));
    await flush();
    expect(lastExternalSetConflicts).toEqual([]);

    state.undatedSets = [
      { trackId: 'rp01', holder: 'a1b2', observer: 'c3d4', path: 'notes/other.md' },
    ];
    expect(state.onChangedCb).toBeTruthy();
    await act(async () => {
      state.onChangedCb!();
    });
    await flush();

    expect(lastExternalSetConflicts).toEqual([
      {
        trackId: 'rp01',
        holder: 'a1b2',
        observer: 'c3d4',
        path: 'notes/other.md',
        title: 'The Party',
      },
    ]);
  });

  it('never fetches for an event editor', async () => {
    function EventHost() {
      useRelationshipEditorConfig({
        entityIndex: [],
        defaultReason: 'Unspecified',
        place: 'event',
        currentPath: () => 'timeline/e.md',
        at: () => 100,
        getDocText: () => '',
      });
      return null;
    }
    act(() => root.render(<EventHost />));
    await flush();
    expect(state.onChangedCb).toBeNull();
  });
});
