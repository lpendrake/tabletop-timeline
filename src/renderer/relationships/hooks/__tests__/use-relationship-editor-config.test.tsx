// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { EditorState, type Extension } from '@codemirror/state';
import { relationshipTagsSpec } from '../../../../shared/relationships';
import { directiveSettings } from '../../editor/config';
import type { ExternalSetConflictEntry } from '../../domain/external-set-conflicts';

const state = vi.hoisted(() => ({
  defaultHolderId: null as string | null,
  onDefaultHolderChangedCb: null as ((id: string | null) => void) | null,
  onChangedCbs: [] as Array<() => void>,
  ledgerFetches: 0,
  undatedFetches: 0,
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
      state.onChangedCbs.push(cb);
      return () => {
        state.onChangedCbs = state.onChangedCbs.filter((c) => c !== cb);
      };
    },
    getAllLedgers: () => {
      state.ledgerFetches++;
      return Promise.resolve([]);
    },
    getUndatedSets: () => {
      state.undatedFetches++;
      return Promise.resolve(state.undatedSets);
    },
  },
}));

import { useRelationshipEditorConfig } from '../use-relationship-editor-config';

/** The directive settings an editor built from `liveExtensions` reads. */
const settingsOf = (liveExtensions: Extension) =>
  EditorState.create({ extensions: liveExtensions }).facet(directiveSettings);

let container: HTMLDivElement;
let root: Root;
let lastDefaultHolderId: string | null | undefined;

function Host() {
  const { liveExtensions } = useRelationshipEditorConfig({
    entityIndex: [],
    defaultReason: 'Unspecified',
    place: 'event',
    currentPath: () => 'timeline/e.md',
    at: () => 100,
    getDocText: () => '',
  });
  lastDefaultHolderId = settingsOf(liveExtensions).choices.defaultHolderId?.();
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
  state.onChangedCbs = [];
  state.ledgerFetches = 0;
  state.undatedSets = [];
  state.undatedFetches = 0;
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

let lastExternalSetConflicts: readonly ExternalSetConflictEntry[] | undefined;

const NOTE_INDEX = [
  { id: 'n1', path: 'notes/other.md', title: 'The Party', type: 'note' as const },
];

function NoteHost({ currentPath }: { currentPath: string }) {
  const { liveExtensions } = useRelationshipEditorConfig({
    entityIndex: NOTE_INDEX,
    defaultReason: 'Unspecified',
    place: 'note',
    currentPath: () => currentPath,
    at: () => null,
    getDocText: () => '',
  });
  lastExternalSetConflicts = settingsOf(liveExtensions).externalSetConflicts;
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

  it('keeps the same conflicts array across re-renders when nothing changed', async () => {
    state.undatedSets = [
      { trackId: 'rp01', holder: 'a1b2', observer: 'c3d4', path: 'notes/other.md' },
    ];
    act(() => root.render(<NoteHost currentPath="notes/this.md" />));
    await flush();
    const first = lastExternalSetConflicts;
    act(() => root.render(<NoteHost currentPath="notes/this.md" />));
    expect(lastExternalSetConflicts).toBe(first);
  });

  it('refreshes when relationships change elsewhere (relationshipsData.onChanged)', async () => {
    act(() => root.render(<NoteHost currentPath="notes/this.md" />));
    await flush();
    expect(lastExternalSetConflicts).toEqual([]);

    state.undatedSets = [
      { trackId: 'rp01', holder: 'a1b2', observer: 'c3d4', path: 'notes/other.md' },
    ];
    expect(state.onChangedCbs.length).toBeGreaterThan(0);
    await act(async () => {
      for (const cb of [...state.onChangedCbs]) cb();
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

  it('never fetches undated sets for an event editor', async () => {
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
    expect(state.undatedFetches).toBe(0);
  });
});

describe('useRelationshipEditorConfig ledger snapshot under StrictMode', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <StrictMode>{children}</StrictMode>;
  }

  it('shares one ledger fetch until a change, and leaves no listener after unmount', async () => {
    const { result, unmount } = renderHook(
      () =>
        useRelationshipEditorConfig({
          entityIndex: [],
          defaultReason: 'Unspecified',
          place: 'event',
          currentPath: () => 'timeline/e.md',
          at: () => 100,
          getDocText: () => '',
        }),
      { wrapper },
    );
    const trackUsage = () =>
      settingsOf(result.current.liveExtensions).choices.trackUsage?.({
        trackId: relationshipTagsSpec.id,
        anchor: 0,
        doc: '',
      });

    expect(state.onChangedCbs).toHaveLength(1);

    await act(async () => {
      await trackUsage();
      await trackUsage();
    });
    expect(state.ledgerFetches).toBe(1);

    await act(async () => {
      for (const cb of [...state.onChangedCbs]) cb();
    });
    await act(async () => {
      await trackUsage();
    });
    expect(state.ledgerFetches).toBe(2);

    unmount();
    expect(state.onChangedCbs).toHaveLength(0);
  });
});

describe('useRelationshipEditorConfig liveExtensions identity', () => {
  const options = (defaultReason: string, onOpenNote: (id: string) => void) => ({
    entityIndex: [],
    defaultReason,
    onOpenNote,
    place: 'event' as const,
    currentPath: () => 'timeline/e.md',
    at: () => 100,
    getDocText: () => '',
  });

  it('keeps the same object for unchanged inputs, even with a new onOpenNote each render', async () => {
    const opened: string[] = [];
    const { result, rerender } = renderHook(
      ({ reason }) => useRelationshipEditorConfig(options(reason, (id) => opened.push(id))),
      { initialProps: { reason: 'Ambush' } },
    );
    await flush();
    const first = result.current.liveExtensions;
    rerender({ reason: 'Ambush' });
    expect(result.current.liveExtensions).toBe(first);

    settingsOf(first).onOpenNote?.('n1');
    expect(opened).toEqual(['n1']);
  });

  it('builds a new object when defaultReason changes, carrying the new reason', async () => {
    const { result, rerender } = renderHook(
      ({ reason }) => useRelationshipEditorConfig(options(reason, () => {})),
      { initialProps: { reason: 'Ambush' } },
    );
    await flush();
    const first = result.current.liveExtensions;
    rerender({ reason: 'Night ambush' });
    expect(result.current.liveExtensions).not.toBe(first);
    expect(settingsOf(result.current.liveExtensions)).toMatchObject({
      defaultReason: 'Night ambush',
      place: 'event',
      readOnly: false,
    });
  });
});
