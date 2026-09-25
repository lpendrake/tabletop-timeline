/**
 * The view-wide pieces every Relationships view row needs (mode, now,
 * labelFor, expand/collapse + drag-reorder callbacks, directivesFor, the
 * entity index, and the open-by-id/open-event handlers). Rows previously
 * threaded these down as ~17 individual props through
 * Outer → Inner → Track → StepList; a row now reads them straight from
 * context and only receives its own row-specific props.
 */
import { createContext, useContext } from 'react';
import type { UseRelationshipsResult } from './hooks/use-relationships';

export interface RelationshipsViewContextValue {
  state: UseRelationshipsResult;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

const RelationshipsViewContext = createContext<RelationshipsViewContextValue | null>(null);

export const RelationshipsViewProvider = RelationshipsViewContext.Provider;

export function useRelationshipsViewContext(): RelationshipsViewContextValue {
  const ctx = useContext(RelationshipsViewContext);
  if (!ctx) {
    throw new Error('useRelationshipsViewContext must be used within a RelationshipsViewProvider');
  }
  return ctx;
}
