import { describe, it, expect } from 'vitest';
import { isInWikiLinkQuery, WIKI_LINK_QUERY_RE } from '../wiki-link-query';

describe('isInWikiLinkQuery', () => {
  it('is true inside an open [[ query', () => {
    expect(isInWikiLinkQuery('[[cap')).toBe(true);
  });

  it('is true across a space within an unterminated query', () => {
    expect(isInWikiLinkQuery('[[cap ')).toBe(true);
  });

  it('an open `[[` query still blocks `/` until `]]`', () => {
    expect(isInWikiLinkQuery('[[cap ')).toBe(true);
    expect(isInWikiLinkQuery('[[abcd]] ')).toBe(false);
  });

  it('is false with no trigger on the line', () => {
    expect(isInWikiLinkQuery('hello world')).toBe(false);
  });

  it('an email address earlier on the line is not a link query', () => {
    expect(isInWikiLinkQuery('me@example.com ')).toBe(false);
  });

  it('`@` followed by a space is not a link query', () => {
    expect(isInWikiLinkQuery('Meet @ the inn ')).toBe(false);
    expect(isInWikiLinkQuery('@cap')).toBe(false);
  });

  it('is false once the query hits a newline or |', () => {
    expect(isInWikiLinkQuery('[[foo\n')).toBe(false);
    expect(isInWikiLinkQuery('[[foo|')).toBe(false);
  });

  it('exposes the shared regex', () => {
    expect(WIKI_LINK_QUERY_RE.test('[[foo')).toBe(true);
  });
});
