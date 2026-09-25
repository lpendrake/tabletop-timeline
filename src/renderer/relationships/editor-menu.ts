/**
 * Builds the "Relationships" editor-menu submenu: one entry per enabled
 * track, each nested with its actions. Selecting an action inserts a fresh
 * directive at the menu's target range. Pure aside from the `onSelect`
 * closures, which only call back into the editor via `EditorMenuContext`.
 */
import type { ContextMenuItem } from '../shared/context-menu';
import type { EditorMenuContext } from '../shared/markdown-editor';
import { insertDirective } from '../shared/markdown-editor';
import {
  allowedActions,
  listTracks,
  serialiseTemplate,
  type TrackLibrary,
} from '../../shared/relationships';

export interface BuildRelationshipMenuItemsOptions {
  library: TrackLibrary;
  /** Track ids to omit. There is no UI for disabling tracks yet — defaults to none. */
  disabledTrackIds?: readonly string[];
  /** Whether this host is a note (undated) or an event. Defaults to `'event'`
   * (the permissive context) — see `allowedActions`/AGENTS.md: a note may
   * only Set/Add, never Change/Shift/Remove. */
  place?: 'note' | 'event';
}

export function buildRelationshipMenuItems(
  ctx: EditorMenuContext,
  options: BuildRelationshipMenuItemsOptions,
): ContextMenuItem[] {
  const disabled = new Set(options.disabledTrackIds ?? []);
  const place = options.place ?? 'event';
  const tracks = listTracks(options.library).filter((t) => !disabled.has(t.id));
  if (tracks.length === 0) return [];

  const trackItems: ContextMenuItem[] = tracks
    .map((track) => ({ track, actions: allowedActions(track, place) }))
    .filter(({ actions }) => actions.length > 0)
    .map(({ track, actions }) => ({
      kind: 'submenu' as const,
      label: track.name,
      items: actions.map((action) => ({
        kind: 'action' as const,
        label: action.label,
        keywords: [track.name, action.label],
        onSelect: () => {
          const text = serialiseTemplate(track.id, action.key, action.template);
          insertDirective(ctx.view, ctx.from, ctx.to, text);
        },
      })),
    }));

  if (trackItems.length === 0) return [];

  return [
    {
      kind: 'submenu',
      label: 'Relationships',
      items: trackItems,
    },
  ];
}
