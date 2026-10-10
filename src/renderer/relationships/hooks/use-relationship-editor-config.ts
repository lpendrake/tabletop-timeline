import { useEffect, useMemo, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import type { EditorMenuContext, EditorMenuExtraItems } from '../../shared/markdown-editor';
import { composeExtraItems } from '../../shared/markdown-editor';
import type { EntityIndexEntry } from '../../../types/global';
import type { ExternalUndatedSet } from '../../../shared/relationships';
import { relationshipsData } from '../data';
import { createLedgerSnapshot } from '../editor/ledger-snapshot';
import { useRelationshipLibraryContext } from '../library-context';
import { notesToPickerOptions } from '../domain/entity-picker-options';
import { externalSetConflictEntries } from '../domain/external-set-conflicts';
import { notePath, findEntityIdByNotePath } from '../../notes/domain/link-resolution';
import { buildRelationshipMenuItems } from '../editor/menu';
import { relationshipEditorExtensions } from '../editor/extensions';
import type { DirectivePlace } from '../editor/config';
import {
  buildRelationshipEditorConfig,
  makeHeldTagsResolver,
  makeTrackUsageResolver,
} from '../editor/host-config';

export interface UseRelationshipEditorConfigOptions {
  entityIndex: readonly EntityIndexEntry[];
  /** Event editor: the event's current title (follows renames). Notes: 'Unspecified'. */
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /**
   * Whether this host is a note (undated) or an event. Required — every
   * caller must say which it is explicitly (see `editor/config.ts`).
   */
  place: DirectivePlace;
  /**
   * The notes editor's currently open note (folder/path). Used to derive
   * both `currentNoteId` (the "this note" badge) and `currentPath` when
   * `currentPath` itself isn't supplied. Omit for the
   * event editor, which has no folder/path pair and passes `currentPath`
   * directly.
   */
  activeNote?: () => { folder: string; path: string } | null;
  /** Campaign-relative path of the note/event currently open, or null if unsaved.
   * Required unless `activeNote` is supplied (the notes editor derives it from that instead). */
  currentPath?: () => string | null;
  /** The declaring point in in-game time: an event's epoch seconds, or null (undated baseline) for a note. */
  at: () => number | null;
  /** The editor's current document text, to locate the directive being edited. */
  getDocText: () => string;
  /** Extra context-menu item builders (e.g. "New note") composed alongside the Relationships submenu. */
  extraMenuItems?: EditorMenuExtraItems;
}

export interface UseRelationshipEditorConfigResult {
  /** Pass to `MarkdownEditor`'s `liveExtensions`. The same object while its inputs are unchanged, so the editor isn't reconfigured on every render. */
  liveExtensions: Extension;
  contextMenu: { extraItems: EditorMenuExtraItems };
}

/**
 * Builds both the directive `liveExtensions` and the composed
 * `contextMenu` (host extras + Relationships submenu) for a `MarkdownEditor`
 * host (the notes editor or the event editor): loads the track library from
 * context, keeps a ledger snapshot and the default holder fresh, and wires
 * the data/callbacks a directive's blanks need. All the actual logic lives in
 * `editor/host-config.ts`, `editor/menu.ts`, `domain/held-options.ts` and
 * `domain/track-usage.ts` — this hook only wires refs and effects.
 */
export function useRelationshipEditorConfig(
  opts: UseRelationshipEditorConfigOptions,
): UseRelationshipEditorConfigResult {
  const library = useRelationshipLibraryContext();

  const [defaultHolderId, setDefaultHolderId] = useState<string | null>(null);

  // The initializer has no side effects, and the effect subscribes on every
  // mount, so StrictMode's mount/unmount/mount cycle leaves one live listener.
  const [ledgerSnapshot] = useState(createLedgerSnapshot);

  useEffect(() => ledgerSnapshot.listen(), [ledgerSnapshot]);

  useEffect(() => {
    let active = true;
    void relationshipsData.getDefaultHolder().then((next) => {
      if (active) setDefaultHolderId(next);
    });
    // The default holder can change without any file changing (the "Make X
    // the default?" prompt writes it directly) — reload on that
    // event so the next holder list leads with the right default.
    const unsubscribeDefaultHolder = relationshipsData.onDefaultHolderChanged((next) => {
      if (active) setDefaultHolderId(next);
    });
    return () => {
      active = false;
      unsubscribeDefaultHolder();
    };
  }, []);

  // Every undated Set declared in another saved note, for the cross-file
  // conflict check — note editors only (events never conflict). Refreshed
  // whenever any file's relationships change (the same event the frozen
  // Relationships view listens to).
  const [undatedSets, setUndatedSets] = useState<ExternalUndatedSet[]>([]);

  useEffect(() => {
    if (opts.place !== 'note') return;
    let active = true;
    const load = () => {
      void relationshipsData.getUndatedSets().then((next) => {
        if (active) setUndatedSets(next);
      });
    };
    load();
    const unsubscribe = relationshipsData.onChanged(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [opts.place]);

  const entityIndexRef = useRef(opts.entityIndex);
  entityIndexRef.current = opts.entityIndex;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const currentNoteId = (): string | null => {
    const active = optsRef.current.activeNote?.();
    return active
      ? findEntityIdByNotePath(entityIndexRef.current, active.folder, active.path)
      : null;
  };

  const currentPath = (): string | null => {
    if (optsRef.current.currentPath) return optsRef.current.currentPath();
    const active = optsRef.current.activeNote?.();
    return active ? notePath(active.folder, active.path) : null;
  };

  const activePath = currentPath();
  // Memoised so the directive extensions (and the reconfigure a new value
  // causes) only change when the sets, the open note or the index do.
  const externalSetConflicts = useMemo(
    () =>
      opts.place === 'note'
        ? externalSetConflictEntries(undatedSets, activePath, opts.entityIndex)
        : undefined,
    [opts.place, undatedSets, activePath, opts.entityIndex],
  );

  const liveExtensions = useMemo(() => {
    const deps = {
      library,
      currentPath,
      at: () => optsRef.current.at(),
      ledgers: () => ledgerSnapshot.all(),
    };
    const heldTags = makeHeldTagsResolver(deps);
    const trackUsage = makeTrackUsageResolver({ ...deps, place: opts.place });

    return relationshipEditorExtensions(
      buildRelationshipEditorConfig({
        library,
        defaultReason: opts.defaultReason,
        onOpenNote: (id) => optsRef.current.onOpenNote?.(id),
        place: opts.place,
        noteOptions: () => notesToPickerOptions(entityIndexRef.current),
        defaultHolderId: () => defaultHolderId,
        currentNoteId,
        heldTags,
        trackUsage,
        externalSetConflicts,
      }),
    );
  }, [
    library,
    opts.defaultReason,
    opts.place,
    defaultHolderId,
    externalSetConflicts,
    ledgerSnapshot,
  ]);

  const contextMenu = useMemo(
    () => ({
      extraItems: composeExtraItems(opts.extraMenuItems, (ctx: EditorMenuContext) =>
        buildRelationshipMenuItems(ctx, { library, place: opts.place }),
      ),
    }),
    [library, opts.place, opts.extraMenuItems],
  );

  return { liveExtensions, contextMenu };
}
