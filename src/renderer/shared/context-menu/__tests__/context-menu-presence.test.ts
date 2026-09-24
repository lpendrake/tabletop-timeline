// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest';
import { isContextMenuOpen } from '../context-menu-presence';

describe('isContextMenuOpen', () => {
  afterEach(() => {
    document.querySelectorAll('.context-menu').forEach((el) => el.remove());
  });

  it('is true while a menu is mounted and false after it closes', () => {
    expect(isContextMenuOpen()).toBe(false);

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    document.body.appendChild(menu);

    expect(isContextMenuOpen()).toBe(true);

    menu.remove();

    expect(isContextMenuOpen()).toBe(false);
  });

  it('is true regardless of what currently has focus', () => {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    (document.activeElement as HTMLElement | null)?.blur?.();

    expect(document.activeElement).toBe(document.body);
    expect(isContextMenuOpen()).toBe(true);

    menu.remove();
  });
});
