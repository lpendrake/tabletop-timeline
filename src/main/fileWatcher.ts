import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import { indexSingleEntity, ASSET_EXTENSIONS } from './entity-index.js';
import { getRelationshipsStore } from './relationships-store.js';
import type { RelationshipFileInput, StoreChangeResult } from './relationships-store.js';

export function shouldNotify(result: StoreChangeResult): boolean {
  return (
    result.touched.length > 0 ||
    result.invalidChanged ||
    result.knownNotesChanged ||
    result.titleChanged
  );
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
        this.pushUpsertDeltas(filePath, 'add', mainWindow);
      })
      .on('change', (filePath: string) => {
        mainWindow.webContents.send('fs:changed', { event: 'change', path: filePath });
        this.pushUpsertDeltas(filePath, 'update', mainWindow);
      })
      .on('unlink', (filePath: string) => {
        mainWindow.webContents.send('fs:changed', { event: 'unlink', path: filePath });
        const rel = path.relative(this.campaignPath, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        const tracked = ext === '.md' || ASSET_EXTENSIONS.has(ext);
        if (tracked && (rel.startsWith('notes/') || rel.startsWith('timeline/'))) {
          mainWindow.webContents.send('entity:indexDelta', { op: 'remove', path: rel });
        }
        this.pushRelationshipsRemoval(rel, ext, mainWindow);
      });

    console.log(`[FileWatcher] Started watching ${campaignPath}`);
  }

  /**
   * Reads an added/changed file once and updates both the entity index and
   * the relationship store from that single read — `indexSingleEntity`
   * appends the relationship input it derives from the same parse into
   * `relationshipInputs` instead of the caller reading the file again.
   */
  private pushUpsertDeltas(filePath: string, op: 'add' | 'update', mainWindow: BrowserWindow) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.md' && !ASSET_EXTENSIONS.has(ext)) return;

    const relationshipInputs: RelationshipFileInput[] = [];
    const entry = indexSingleEntity(filePath, this.campaignPath, relationshipInputs);
    if (entry) {
      mainWindow.webContents.send('entity:indexDelta', { op, entry });
    }

    const input = relationshipInputs[0];
    if (!input) return;
    const result = getRelationshipsStore().updateFile(input);
    if (shouldNotify(result)) {
      mainWindow.webContents.send('relationships:changed', { paths: [input.path] });
    }
  }

  /** Keeps the relationship store current as a note/event is deleted; notifies the renderer only when something actually changed. */
  private pushRelationshipsRemoval(rel: string, ext: string, mainWindow: BrowserWindow) {
    if (ext !== '.md') return;
    const isNote = rel.startsWith('notes/');
    const isEvent = rel.startsWith('timeline/');
    if (!isNote && !isEvent) return;

    const result = getRelationshipsStore().removeFile(rel);
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
