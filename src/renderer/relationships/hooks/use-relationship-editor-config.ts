import { useEffect, useMemo, useRef, useState } from 'react';
import type { RelationshipDirectivesHostConfig } from '../../shared/markdown-editor';
import type { EntityIndexEntry } from '../../../types/global';
import type { Ledger } from '../../../shared/relationships';
import { effectiveLinkLabel } from '../../../shared/entity-labels';
import { relationshipsData } from '../data';
import { useRelationshipLibrary } from './use-relationship-library';
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
  /** The open note's entity id, for the "already linked" recent-notes ordering. Omit in the event editor. */
  currentNoteId?: () => string | null;
  /** Campaign-relative path of the note/event currently open, or null if unsaved. Used to exclude the directive being edited from `heldOptions`. */
  currentPath: () => string | null;
  /** The declaring point in in-game time: an event's epoch seconds, or null (undated baseline) for a note. */
  at: () => number | null;
  /** The editor's current document text, to locate the directive being edited. */
  getDocText: () => string;
  confirm: ConfirmFn;
}

/**
 * Builds the `relationshipDirectives` config for a `MarkdownEditor` host
 * (the notes editor or the event editor): loads the track library, keeps a
 * ledger snapshot and the default holder fresh, and wires the fill-in
 * bubble's data/callbacks. All the actual logic lives in `editor-host-config.ts`
 * and `domain/held-options.ts` — this hook only wires refs and effects.
 */
export function useRelationshipEditorConfig(
  opts: UseRelationshipEditorConfigOptions,
): RelationshipDirectivesHostConfig {
  const library = useRelationshipLibrary();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [defaultHolderId, setDefaultHolderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reload = () => {
      void relationshipsData.getAllLedgers().then((next) => {
        if (active) setLedgers(next);
      });
      void relationshipsData.getDefaultHolder().then((next) => {
        if (active) setDefaultHolderId(next);
      });
    };
    reload();
    const unsubscribe = relationshipsData.onChanged(reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const entityIndexRef = useRef(opts.entityIndex);
  entityIndexRef.current = opts.entityIndex;
  const ledgersRef = useRef(ledgers);
  ledgersRef.current = ledgers;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const labelFor = (id: string): string => {
    const entry = entityIndexRef.current.find((e) => e.id === id);
    return entry ? effectiveLinkLabel(entry) : id;
  };

  return useMemo(() => {
    const heldOptions = makeHeldOptionsResolver({
      library,
      getLedgers: () => ledgersRef.current,
      getDocText: () => optsRef.current.getDocText(),
      currentPath: () => optsRef.current.currentPath(),
      at: () => optsRef.current.at(),
    });

    return buildRelationshipEditorConfig({
      library,
      defaultReason: opts.defaultReason,
      onOpenNote: opts.onOpenNote,
      noteOptions: () =>
        entityIndexRef.current
          .filter((e) => e.type === 'note')
          .map((e) => ({ id: e.id, path: e.path, label: effectiveLinkLabel(e) })),
      defaultHolderId: () => defaultHolderId,
      currentNoteId: () => optsRef.current.currentNoteId?.() ?? null,
      onHolderChosenWithoutDefault: makeHolderChosenHandler(opts.confirm, labelFor),
      heldOptions,
    });
  }, [library, opts.defaultReason, opts.onOpenNote, opts.confirm, defaultHolderId]);
}
