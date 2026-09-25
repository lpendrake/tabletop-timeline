import { useEffect, useState } from 'react';
import { EMPTY_TRACK_LIBRARY, type TrackLibrary } from '../../../shared/relationships';
import { relationshipsData } from '../data';

/**
 * Loads the workspace's track library and keeps it fresh, reloading
 * whenever relationship data changes elsewhere (a new option added, a track
 * edited in settings, etc). Any host embedding the editor's relationship
 * menu or fill-in bubbles needs this.
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
    const unsubscribe = relationshipsData.onChanged(reload);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return library;
}
