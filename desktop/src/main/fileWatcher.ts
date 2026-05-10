import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import type * as chokidarType from 'chokidar';

export class FileWatcher {
  private watcher: chokidarType.FSWatcher | null = null;
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  public async start(mainWindow: BrowserWindow) {
    if (this.watcher) return;

    if (!fs.existsSync(this.targetDir)) {
      fs.mkdirSync(this.targetDir, { recursive: true });
    }

    // Bypass TypeScript's ESM transpilation by using Function constructor
    // This forces the dynamic import to remain untouched in the output JS
    const loadChokidar = new Function("return import('chokidar')");
    const chokidar = await loadChokidar();

    this.watcher = chokidar.watch(this.targetDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher!
      .on('add', (filePath: string) => mainWindow.webContents.send('fs:changed', { event: 'add', path: filePath }))
      .on('change', (filePath: string) => mainWindow.webContents.send('fs:changed', { event: 'change', path: filePath }))
      .on('unlink', (filePath: string) => mainWindow.webContents.send('fs:changed', { event: 'unlink', path: filePath }));
      
    console.log(`[FileWatcher] Started watching ${this.targetDir}`);
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
