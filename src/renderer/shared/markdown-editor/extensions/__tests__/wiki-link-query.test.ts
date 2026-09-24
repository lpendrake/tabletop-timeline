import { describe, it, expect } from 'vitest';
import { isInWikiLinkQuery, WIKI_LINK_QUERY_RE } from '../wiki-link-query';

describe('isInWikiLinkQuery', () => {
  it('is true inside an open [[ query', () => {
    expect(isInWikiLinkQuery('[[cap')).toBe(true);
  });

  it('is true inside an open @ query', () => {
    expect(isInWikiLinkQuery('@cap')).toBe(true);
  });

  it('is true across a space within an unterminated query', () => {
    expect(isInWikiLinkQuery('@done ')).toBe(true);
  });

  it('is false once a [[ query is closed with ]]', () => {
    expect(isInWikiLinkQuery('[[abcd]] ')).toBe(false);
  });

  it('is false with no trigger character on the line', () => {
    expect(isInWikiLinkQuery('hello world')).toBe(false);
  });

  it('is false once the query hits a newline, |, or another @', () => {
    expect(isInWikiLinkQuery('@foo\n')).toBe(false);
    expect(isInWikiLinkQuery('@foo|')).toBe(false);
    expect(isInWikiLinkQuery('@foo@')).toBe(true); // the second @ restarts the query
  });

  it('exposes the shared regex', () => {
    expect(WIKI_LINK_QUERY_RE.test('@foo')).toBe(true);
  });
});
