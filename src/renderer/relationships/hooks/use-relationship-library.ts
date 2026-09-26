import { useEffect, useState } from 'react';
import { EMPTY_TRACK_LIBRARY, type TrackLibrary } from '../../../shared/relationships';
import { relationshipsData } from '../data';

/**
 * Loads the workspace's track library once and keeps it fresh, reloading
 * whenever the library itself changes (a new option added, a track edited
 * in settings, etc — see `relationshipsData.onLibraryChanged`). Called once,
 * at app level; every other host reads the result via
 * `RelationshipLibraryProvider`/`useRelationshipLibraryContext` instead of
 * calling this hook again.
 */
export function useRelationshipLibrary(): TrackLibrary {
  const [library, setLibrary] = useState<TrackLibrary>(EMPTY_TRACK_LIBRARY);

  useEffect(() => {
    let active = true;
    const reload = () => {
      relationshipsData
        .getTracks()
        .then((next) => {
          if (active) setLibrary(next);
        })
        .catch(() => {});
    };
    reload();
    const unsubscribe = relationshipsData.onLibraryChanged(reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return library;
}
