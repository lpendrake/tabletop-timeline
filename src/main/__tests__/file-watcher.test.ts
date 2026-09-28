import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

import { shouldNotify } from '../fileWatcher.js';

describe('shouldNotify', () => {
  const quiet = {
    touched: [],
    invalidChanged: false,
    knownNotesChanged: false,
    titleChanged: false,
  };

  it('is false when nothing changed', () => {
    expect(shouldNotify(quiet)).toBe(false);
  });

  it('shouldNotify is true for a title-only change', () => {
    expect(shouldNotify({ ...quiet, titleChanged: true })).toBe(true);
  });
});
