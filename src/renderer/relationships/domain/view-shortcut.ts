import type { ViewType } from '../../components/footer';

/** The unmodified key that switches to each view. */
export const VIEW_SHORTCUT_KEYS: Record<ViewType, string> = {
  timeline: 'F1',
  notes: 'F2',
  relationships: 'F3',
};

/** The view whose shortcut key was pressed; any modifier (or another key) gives null. */
export function viewForKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): ViewType | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  const match = (Object.keys(VIEW_SHORTCUT_KEYS) as ViewType[]).find(
    (view) => VIEW_SHORTCUT_KEYS[view] === e.key,
  );
  return match ?? null;
}
