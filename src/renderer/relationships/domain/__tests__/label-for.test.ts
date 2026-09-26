import { describe, it, expect } from 'vitest';
import { resolveEntityLabel, UNKNOWN_ENTITY_LABEL } from '../label-for';
import type { EntityIndexEntry } from '../../../../types/global';

function entry(
  partial: Partial<EntityIndexEntry> & Pick<EntityIndexEntry, 'id'>,
): EntityIndexEntry {
  return { path: `notes/${partial.id}.md`, title: partial.id, type: 'note', ...partial };
}

describe('labels never show raw ids', () => {
  it('prefers the entity label map', () => {
    const map = new Map([['aaaa', 'Zara']]);
    expect(resolveEntityLabel('aaaa', map, [])).toBe('Zara');
  });

  it('falls back to the entity index title (via effectiveLinkLabel) when the map misses', () => {
    const map = new Map<string, string>();
    const index = [entry({ id: 'bbbb', title: 'Anna' })];
    expect(resolveEntityLabel('bbbb', map, index)).toBe('Anna');
  });

  it('honours a linkLabelOverride from the entity index', () => {
    const map = new Map<string, string>();
    const index = [entry({ id: 'bbbb', title: 'Anna', linkLabelOverride: 'The Baker' })];
    expect(resolveEntityLabel('bbbb', map, index)).toBe('The Baker');
  });

  it('falls back to a neutral placeholder, never the raw id, when both miss', () => {
    const result = resolveEntityLabel('zzzz-unknown-id', new Map(), []);
    expect(result).toBe(UNKNOWN_ENTITY_LABEL);
    expect(result).not.toBe('zzzz-unknown-id');
  });
});
