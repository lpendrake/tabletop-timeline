import { describe, it, expect } from 'vitest';
import { viewForKey } from '../view-shortcut';

const mods = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe('view shortcut', () => {
  it('F1/F2/F3 map to views and any modifier is ignored', () => {
    expect(viewForKey({ key: 'F1', ...mods })).toBe('timeline');
    expect(viewForKey({ key: 'F2', ...mods })).toBe('notes');
    expect(viewForKey({ key: 'F3', ...mods })).toBe('relationships');
    expect(viewForKey({ key: 'F4', ...mods })).toBeNull();
    for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      expect(viewForKey({ key: 'F3', ...mods, [m]: true })).toBeNull();
    }
  });
});
