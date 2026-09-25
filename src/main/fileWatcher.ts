import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import { indexSingleEntity, ASSET_EXTENSIONS } from './entity-index.js';
import { parseNote } from '../shared/frontmatter.js';
import { parseEventFile, SAFE_FILENAME_RE } from './timelineIpcHandlers.js';
import { getRelationshipsStore } from './relationships-store.js';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private campaignPath = '';
  /** notes/<rel>.md -> frontmatter id, kept so an unlink can drop it from the relationships store's known-note set. */
  private noteIdsByPath = new Map<string, string>();

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

  /** Keeps the relationship store's directive index (and known-note-id set) current as files change. */
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
      store.removeFile(rel);
      if (isNote) {
        const id = this.noteIdsByPath.get(rel);
        if (id) {
          store.removeKnownNoteId(id);
          this.noteIdsByPath.delete(rel);
        }
      }
      mainWindow.webContents.send('relationships:changed', { paths: [rel] });
      return;
    }

    if (!fs.existsSync(filePath)) return;

    if (isEvent) {
      if (!SAFE_FILENAME_RE.test(path.basename(filePath))) return;
      const { event } = parseEventFile(filePath, path.basename(filePath));
      store.updateFile({
        path: rel,
        source: event.body,
        title: event.title,
        isEvent: true,
        epochSeconds: event.epochSeconds ?? null,
      });
    } else {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fallbackTitle = path.basename(filePath, '.md');
      const { frontmatter, body } = parseNote(content, fallbackTitle);
      this.noteIdsByPath.set(rel, frontmatter.id);
      store.addKnownNoteId(frontmatter.id);
      store.updateFile({ path: rel, source: body, title: frontmatter.title, isEvent: false });
    }

    mainWindow.webContents.send('relationships:changed', { paths: [rel] });
  }

  public stop() {
    this.noteIdsByPath.clear();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
