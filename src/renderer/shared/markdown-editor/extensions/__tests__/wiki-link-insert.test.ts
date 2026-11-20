import { describe, it, expect } from 'vitest';
import { buildWikiLinkInsert, type WikiLinkSuggestion } from '../wiki-link-insert';

describe('buildWikiLinkInsert', () => {
  const note: WikiLinkSuggestion = { id: 'abc1', label: 'Alice' };

  it('inserts [[id]] format (not [[label|id]])', () => {
    const { insert } = buildWikiLinkInsert(note, 8, 15, 'xx');
    expect(insert).toBe('[[abc1]]');
  });

  it('inserting at a bare caret replaces nothing before it', () => {
    const { replaceFrom, replaceTo } = buildWikiLinkInsert(note, 12, 12, 'xx');
    expect(replaceFrom).toBe(12);
    expect(replaceTo).toBe(12);
  });

  it('does not absorb trailing ]] when not present', () => {
    const { replaceTo } = buildWikiLinkInsert(note, 8, 15, 'xx');
    expect(replaceTo).toBe(15);
  });

  it('absorbs trailing ]] when already present', () => {
    const { replaceTo } = buildWikiLinkInsert(note, 8, 15, ']]');
    expect(replaceTo).toBe(17);
  });

  it('inserts image markdown for asset suggestions', () => {
    const img: WikiLinkSuggestion = { id: 'img1', label: 'photo', assetPath: 'images/photo.png' };
    const { insert, replaceTo } = buildWikiLinkInsert(img, 3, 10, ']]');
    expect(insert).toBe('![photo](notes-asset://current/images/photo.png)');
    expect(replaceTo).toBe(10);
  });
});
