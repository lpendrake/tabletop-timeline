/**
 * Builds the "Relationships" editor-menu submenu: one entry per enabled
 * track, each nested with its actions. Selecting an action inserts a fresh
 * directive at the menu's target range. Pure aside from the `onSelect`
 * closures, which only call back into the editor via `EditorMenuContext`.
 */
import type { ContextMenuItem } from '../shared/context-menu';
import type { EditorMenuContext } from '../shared/markdown-editor';
import { insertDirective } from '../shared/markdown-editor';
import { listTracks, serialiseTemplate, type TrackLibrary } from '../../shared/relationships';

export interface BuildRelationshipMenuItemsOptions {
  library: TrackLibrary;
  /** Track ids to omit. There is no UI for disabling tracks yet — defaults to none. */
  disabledTrackIds?: readonly string[];
}

export function buildRelationshipMenuItems(
  ctx: EditorMenuContext,
  options: BuildRelationshipMenuItemsOptions,
): ContextMenuItem[] {
  const disabled = new Set(options.disabledTrackIds ?? []);
  const tracks = listTracks(options.library).filter((t) => !disabled.has(t.id));
  if (tracks.length === 0) return [];

  const trackItems: ContextMenuItem[] = tracks.map((track) => ({
    kind: 'submenu',
    label: track.name,
    items: track.actions.map((action) => ({
      kind: 'action',
      label: action.label,
      keywords: [track.name, action.label],
      onSelect: () => {
        const text = serialiseTemplate(track.id, action.key, action.template);
        insertDirective(ctx.view, ctx.from, ctx.to, text);
      },
    })),
  }));

  return [
    {
      kind: 'submenu',
      label: 'Relationships',
      items: trackItems,
    },
  ];
}
