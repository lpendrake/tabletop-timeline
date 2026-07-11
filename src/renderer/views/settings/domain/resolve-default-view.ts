import type { ViewType } from '../../../components/footer';

export function resolveDefaultView(saved: string | null | undefined): ViewType {
  if (saved === 'notes') return 'notes';
  if (saved === 'timeline') return 'timeline';
  return 'timeline';
}
