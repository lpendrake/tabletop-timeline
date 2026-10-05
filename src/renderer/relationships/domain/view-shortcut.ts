import type { ViewType } from '../../components/footer';

/** F1 timeline, F2 notes, F3 relationships; any modifier (or another key) gives null. */
export function viewForKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): ViewType | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.key === 'F1') return 'timeline';
  if (e.key === 'F2') return 'notes';
  if (e.key === 'F3') return 'relationships';
  return null;
}
