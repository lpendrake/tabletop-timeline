import type { EntityIndexEntry } from '../../types/global';
import type { WikiLinkSuggestion } from './markdown-editor';
import { matchesEntityQuery } from './entity-match';

export function suggestLinks(
  entityIndex: readonly EntityIndexEntry[],
  query: string,
): WikiLinkSuggestion[] {
  return entityIndex
    .filter((e) => matchesEntityQuery(e.title, e.id, query))
    .map((e) =>
      e.type === 'asset'
        ? { id: '', label: e.title, detail: e.path, assetPath: e.path }
        : { id: e.id, label: e.title, detail: e.path },
    );
}
