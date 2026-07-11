import { describe, expect, it } from 'vitest';
import { resolveDefaultView } from '../resolve-default-view';

describe('resolveDefaultView', () => {
  it('returns notes when saved value is "notes"', () => {
    expect(resolveDefaultView('notes')).toBe('notes');
  });

  it('returns timeline when saved value is "timeline"', () => {
    expect(resolveDefaultView('timeline')).toBe('timeline');
  });

  it('returns timeline when saved value is null (no-preference fallback)', () => {
    expect(resolveDefaultView(null)).toBe('timeline');
  });

  it('returns timeline when saved value is undefined', () => {
    expect(resolveDefaultView(undefined)).toBe('timeline');
  });

  it('returns timeline when saved value is empty string', () => {
    expect(resolveDefaultView('')).toBe('timeline');
  });

  it('returns timeline when saved value is "relationships" (out of scope, not selectable)', () => {
    expect(resolveDefaultView('relationships')).toBe('timeline');
  });

  it('returns timeline when saved value is an unknown string', () => {
    expect(resolveDefaultView('bogus')).toBe('timeline');
  });
});
