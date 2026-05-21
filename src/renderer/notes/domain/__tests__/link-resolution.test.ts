import { describe, it, expect } from 'vitest';
import { suggestLinks, resolveLinkById, resolveMarkdownHref } from '../link-resolution';
import type { LinkIndexEntry } from '../../../../types/global';

const idx: LinkIndexEntry[] = [
  { id: 'a1', path: 'notes/Lore/bob.md', title: 'Bob the Brave', type: 'note' },
  { id: 'a2', path: 'notes/Lore/places.md', title: 'Places', type: 'note' },
  { id: 'e1', path: 'timeline/sess-01.md', title: 'Session 1', type: 'event' },
  { id: 's3', path: 'notes/assets/map.png', title: 'World Map', type: 'asset' },
];

describe('suggestLinks', () => {
  it('matches by title substring case-insensitively', () => {
    expect(suggestLinks(idx, 'bob')).toEqual([
      { id: 'a1', label: 'Bob the Brave', detail: 'notes/Lore/bob.md' },
    ]);
  });

  it('matches by id', () => {
    const result = suggestLinks(idx, 'e1');
    expect(result[0].id).toBe('e1');
  });

  it('asset entries carry assetPath and a blank id', () => {
    const result = suggestLinks(idx, 'map');
    expect(result[0]).toMatchObject({
      id: '',
      label: 'World Map',
      assetPath: 'notes/assets/map.png',
    });
  });

  it('returns [] when nothing matches', () => {
    expect(suggestLinks(idx, 'xyzzy')).toEqual([]);
  });
});

describe('resolveLinkById', () => {
  it('returns not-found for unknown id', () => {
    expect(resolveLinkById(idx, 'nope')).toEqual({ kind: 'not-found' });
  });

  it('strips "timeline/" prefix for events', () => {
    expect(resolveLinkById(idx, 'e1')).toEqual({ kind: 'event', filename: 'sess-01.md' });
  });

  it('splits notes path into folder + path (folder = first segment after "notes/")', () => {
    expect(resolveLinkById(idx, 'a1')).toEqual({
      kind: 'note',
      folder: 'Lore',
      path: 'bob.md',
    });
  });
});

describe('resolveMarkdownHref', () => {
  it('resolves against exact path', () => {
    expect(resolveMarkdownHref(idx, 'notes/Lore/bob.md')?.id).toBe('a1');
  });

  it('strips leading "./" before matching', () => {
    expect(resolveMarkdownHref(idx, './notes/Lore/places.md')?.id).toBe('a2');
  });

  it('matches by suffix (endsWith "/" + target)', () => {
    expect(resolveMarkdownHref(idx, 'Lore/bob.md')?.id).toBe('a1');
  });

  it('returns null when nothing matches', () => {
    expect(resolveMarkdownHref(idx, 'nowhere.md')).toBeNull();
  });
});
