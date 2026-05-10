import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  public createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      fullscreen: true,
      autoHideMenuBar: false, // Temporary: show menu so we can open DevTools if it's blank
      icon: path.join(app.getAppPath(), 'src/assets/images/icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(app.getAppPath(), 'dist/preload/index.cjs'),
      },
    });

    const isDev = !app.isPackaged;

    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173');
    } else {
      this.mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    }

    return this.mainWindow;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}

export const windowManager = new WindowManager();
