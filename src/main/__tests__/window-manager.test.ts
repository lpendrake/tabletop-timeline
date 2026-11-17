import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';

const appState = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => {
  class BrowserWindow {
    maximize = vi.fn();
    show = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
  }
  return {
    app: {
      get isPackaged() {
        return appState.isPackaged;
      },
      getAppPath: () => '/app',
    },
    BrowserWindow,
  };
});

import { WindowManager } from '../windowManager.js';
import { DEV_SERVER_URL } from '../renderer-source.js';

let savedRenderer: string | undefined;

beforeEach(() => {
  savedRenderer = process.env.TT_RENDERER;
  delete process.env.TT_RENDERER;
  appState.isPackaged = false;
});

afterEach(() => {
  if (savedRenderer === undefined) delete process.env.TT_RENDERER;
  else process.env.TT_RENDERER = savedRenderer;
});

describe('WindowManager.createMainWindow', () => {
  it('main window loads dist/index.html from the app path when the source is dist, and never calls loadURL', () => {
    process.env.TT_RENDERER = 'dist';
    const win = new WindowManager().createMainWindow();

    expect(win.loadFile).toHaveBeenCalledWith(path.join('/app', 'dist/index.html'));
    expect(win.loadURL).not.toHaveBeenCalled();
    expect(win.maximize).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
  });

  it('main window loads the dev server URL when the source is the dev server', () => {
    const win = new WindowManager().createMainWindow();

    expect(win.loadURL).toHaveBeenCalledWith(DEV_SERVER_URL);
    expect(win.loadFile).not.toHaveBeenCalled();
  });
});
