import type { EntityIndexEntry } from '../../../../types/global';
import { resolveEntityLabel } from '../../../relationships/domain/label-for';

/** The current holder's display label, or null when unset. */
export function holderLabel(
  entityIndex: readonly EntityIndexEntry[],
  holderId: string | null,
): string | null {
  if (!holderId) return null;
  return resolveEntityLabel(holderId, new Map(), entityIndex);
}
