import { useMemo, useRef } from 'react';
import { makeNewNoteMenuConfig } from '../editor-bindings';
import type { CreatedNote } from '../create-note';
import type { EntityIndexEntry } from '../../../types/global';

export interface UseNewNoteMenuConfigOptions {
  campaignPath: string;
  entityIndex: readonly EntityIndexEntry[];
  onCreated?: (note: CreatedNote) => void;
}

/**
 * Builds the editor `contextMenu` config for the "New note…" menu action,
 * shared by every host that embeds the markdown editor (the notes view and
 * the event editor). `entityIndex` changes on every entity-index update; a
 * ref keeps the menu config reading the latest one without rebuilding it
 * (and without retriggering the editor's own menu-position effects).
 */
export function useNewNoteMenuConfig({
  campaignPath,
  entityIndex,
  onCreated,
}: UseNewNoteMenuConfigOptions) {
  const entityIndexRef = useRef(entityIndex);
  entityIndexRef.current = entityIndex;

  return useMemo(
    () =>
      makeNewNoteMenuConfig({
        campaignPath,
        getEntityIndex: () => entityIndexRef.current,
        onCreated,
      }),
    [campaignPath, onCreated],
  );
}
