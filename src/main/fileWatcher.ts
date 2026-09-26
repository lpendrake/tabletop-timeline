import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import { indexSingleEntity, ASSET_EXTENSIONS } from './entity-index.js';
import { SAFE_FILENAME_RE } from './timelineIpcHandlers.js';
import { readRelationshipFileInput } from './relationships-index.js';
import { getRelationshipsStore } from './relationships-store.js';
import type { StoreChangeResult } from './relationships-store.js';

function shouldNotify(result: StoreChangeResult): boolean {
  return result.touched.length > 0 || result.invalidChanged || result.knownNotesChanged;
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private campaignPath = '';

  public async start(campaignPath: string, mainWindow: BrowserWindow) {
    this.stop();
    this.campaignPath = campaignPath;

    if (!fs.existsSync(campaignPath)) {
      fs.mkdirSync(campaignPath, { recursive: true });
    }

    this.watcher = chokidar.watch(campaignPath, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      // Prevents duplicate events on Windows when editors write files in stages.
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher
      .on('add', (filePath: string) => {
        mainWindow.webContents.send('fs:changed', { event: 'add', path: filePath });
        this.pushIndexDelta(filePath, 'add', mainWindow);
        this.pushRelationshipsDelta(filePath, 'update', mainWindow);
      })
      .on('change', (filePath: string) => {
        mainWindow.webContents.send('fs:changed', { event: 'change', path: filePath });
        this.pushIndexDelta(filePath, 'update', mainWindow);
        this.pushRelationshipsDelta(filePath, 'update', mainWindow);
      })
      .on('unlink', (filePath: string) => {
        mainWindow.webContents.send('fs:changed', { event: 'unlink', path: filePath });
        const rel = path.relative(this.campaignPath, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        const tracked = ext === '.md' || ASSET_EXTENSIONS.has(ext);
        if (tracked && (rel.startsWith('notes/') || rel.startsWith('timeline/'))) {
          mainWindow.webContents.send('entity:indexDelta', { op: 'remove', path: rel });
        }
        this.pushRelationshipsDelta(filePath, 'remove', mainWindow);
      });

    console.log(`[FileWatcher] Started watching ${campaignPath}`);
  }

  private pushIndexDelta(filePath: string, op: 'add' | 'update', mainWindow: BrowserWindow) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.md' && !ASSET_EXTENSIONS.has(ext)) return;
    const entry = indexSingleEntity(filePath, this.campaignPath);
    if (!entry) return;
    mainWindow.webContents.send('entity:indexDelta', { op, entry });
  }

  /** Keeps the relationship store current as files change; notifies the renderer only when something actually changed. */
  private pushRelationshipsDelta(
    filePath: string,
    op: 'update' | 'remove',
    mainWindow: BrowserWindow,
  ) {
    if (path.extname(filePath).toLowerCase() !== '.md') return;
    const rel = path.relative(this.campaignPath, filePath).replace(/\\/g, '/');
    const isNote = rel.startsWith('notes/');
    const isEvent = rel.startsWith('timeline/');
    if (!isNote && !isEvent) return;

    const store = getRelationshipsStore();

    if (op === 'remove') {
      const result = store.removeFile(rel);
      if (shouldNotify(result)) {
        mainWindow.webContents.send('relationships:changed', { paths: [rel] });
      }
      return;
    }

    if (!fs.existsSync(filePath)) return;
    if (isEvent && !SAFE_FILENAME_RE.test(path.basename(filePath))) return;

    const input = readRelationshipFileInput(this.campaignPath, rel);
    const result = store.updateFile(input);
    if (shouldNotify(result)) {
      mainWindow.webContents.send('relationships:changed', { paths: [rel] });
    }
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
