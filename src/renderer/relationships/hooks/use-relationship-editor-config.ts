import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  RelationshipDirectivesHostConfig,
  EditorMenuContext,
  EditorMenuExtraItems,
} from '../../shared/markdown-editor';
import { composeExtraItems } from '../../shared/markdown-editor';
import type { EntityIndexEntry } from '../../../types/global';
import { relationshipsData } from '../data';
import { useRelationshipLibraryContext } from '../library-context';
import { resolveEntityLabel } from '../domain/label-for';
import { notesToPickerOptions } from '../domain/note-picker-options';
import { notePath, findEntityIdByNotePath } from '../../notes/domain/link-resolution';
import { buildRelationshipMenuItems } from '../editor-menu';
import {
  buildRelationshipEditorConfig,
  makeHeldOptionsResolver,
  makeHolderChosenHandler,
  type ConfirmFn,
} from '../editor-host-config';

export interface UseRelationshipEditorConfigOptions {
  entityIndex: readonly EntityIndexEntry[];
  /** Event editor: the event's current title (follows renames). Notes: 'Unspecified'. */
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /** Whether this host is a note (undated) or an event. Defaults to `'event'` when omitted. */
  place?: 'note' | 'event';
  /**
   * The notes editor's currently open note (folder/path). Used to derive
   * both `currentNoteId` (the "already linked" recent-notes ordering) and
   * `currentPath` when `currentPath` itself isn't supplied. Omit for the
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
  confirm: ConfirmFn;
  /** Extra context-menu item builders (e.g. "New note") composed alongside the Relationships submenu. */
  extraMenuItems?: EditorMenuExtraItems;
}

export interface UseRelationshipEditorConfigResult {
  relationshipDirectives: RelationshipDirectivesHostConfig;
  contextMenu: { extraItems: EditorMenuExtraItems };
}

/**
 * Builds both the `relationshipDirectives` config and the composed
 * `contextMenu` (host extras + Relationships submenu) for a `MarkdownEditor`
 * host (the notes editor or the event editor): loads the track library from
 * context, keeps a ledger snapshot and the default holder fresh, and wires
 * the fill-in bubble's data/callbacks. All the actual logic lives in
 * `editor-host-config.ts`, `editor-menu.ts` and `domain/held-options.ts` —
 * this hook only wires refs and effects.
 */
export function useRelationshipEditorConfig(
  opts: UseRelationshipEditorConfigOptions,
): UseRelationshipEditorConfigResult {
  const library = useRelationshipLibraryContext();

  const [defaultHolderId, setDefaultHolderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void relationshipsData.getDefaultHolder().then((next) => {
      if (active) setDefaultHolderId(next);
    });
    // The default holder can change without any file changing (the "Make X
    // the default?" bubble prompt writes it directly) — reload on that
    // event so the next bubble pre-fills without a stale value.
    const unsubscribeDefaultHolder = relationshipsData.onDefaultHolderChanged((next) => {
      if (active) setDefaultHolderId(next);
    });
    return () => {
      active = false;
      unsubscribeDefaultHolder();
    };
  }, []);

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

  const relationshipDirectives = useMemo(() => {
    const labelFor = (id: string): string =>
      resolveEntityLabel(id, new Map(), entityIndexRef.current);
    const heldOptions = makeHeldOptionsResolver({
      library,
      currentPath,
      at: () => optsRef.current.at(),
    });

    return buildRelationshipEditorConfig({
      library,
      defaultReason: opts.defaultReason,
      onOpenNote: opts.onOpenNote,
      place: opts.place,
      noteOptions: () => notesToPickerOptions(entityIndexRef.current),
      defaultHolderId: () => defaultHolderId,
      currentNoteId,
      onHolderChosenWithoutDefault: makeHolderChosenHandler(opts.confirm, labelFor),
      heldOptions,
    });
  }, [library, opts.defaultReason, opts.onOpenNote, opts.place, opts.confirm, defaultHolderId]);

  const contextMenu = useMemo(
    () => ({
      extraItems: composeExtraItems(opts.extraMenuItems, (ctx: EditorMenuContext) =>
        buildRelationshipMenuItems(ctx, { library, place: opts.place }),
      ),
    }),
    [library, opts.place, opts.extraMenuItems],
  );

  return { relationshipDirectives, contextMenu };
}
