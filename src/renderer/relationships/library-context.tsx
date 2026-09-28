/**
 * The single app-level track library, loaded once by `App` (via
 * `useRelationshipLibrary`) and shared by every consumer through context
 * instead of each host loading its own copy — the timeline (cards, card
 * expansion), the notes editor, the event editor, and the Relationships
 * view. Peek gets it through its own injected `getRelationshipLibrary`
 * getter (see `peek/AGENTS.md` — peek may not import from here).
 */
import { createContext, useContext } from 'react';
import { EMPTY_TRACK_LIBRARY, type TrackLibrary } from '../../shared/relationships';

const RelationshipLibraryContext = createContext<TrackLibrary>(EMPTY_TRACK_LIBRARY);

export const RelationshipLibraryProvider = RelationshipLibraryContext.Provider;

export function useRelationshipLibraryContext(): TrackLibrary {
  return useContext(RelationshipLibraryContext);
}
