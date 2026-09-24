import type {
  ImagePasteConfig,
  DropLinkConfig,
  DropInsert,
  WikiLinksHostConfig,
  EditorMenuExtraItems,
} from '../shared/markdown-editor';
import { notesData } from './data';
import { openFromWikiLink, closeFromWikiLink } from '../peek/stack';
import { runNewNoteFromEditor } from './new-note-from-editor';
import type { CreatedNote } from './create-note';

interface SidebarDropPayload {
  folder: string;
  path: string;
  kind: 'file' | 'dir' | 'topfolder';
  displayName: string;
  id?: string;
  fileKind?: 'note' | 'asset' | 'unsupported';
}

const DRAG_MIME = 'application/x-last-gasp-note';

export function makeImagePasteConfig(folder: string, campaignPath: string): ImagePasteConfig {
  return {
    onImagePaste: async (blob: Blob, mimeType: string): Promise<string | null> => {
      const ext = mimeType.split('/')[1] ?? 'png';
      const filename = `pasted-${Date.now()}.${ext}`;
      const relPath = `notes/${folder}/assets/${filename}`;
      const fullPath = `${campaignPath}/${relPath}`;
      const buffer = await blob.arrayBuffer();
      const ok = await notesData.saveImage(fullPath, new Uint8Array(buffer));
      return ok ? `notes-asset://current/${relPath}` : null;
    },
  };
}

export function makeDropLinkConfig(): DropLinkConfig {
  return {
    dropMimeType: DRAG_MIME,
    decodeDrop: (event: DragEvent): DropInsert | null => {
      const raw = event.dataTransfer?.getData(DRAG_MIME);
      if (!raw) return null;

      let payload: SidebarDropPayload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return null;
      }

      if (payload.kind !== 'file') return null;

      if (payload.fileKind === 'asset') {
        return {
          insert: `![${payload.displayName}](notes-asset://current/notes/${payload.folder}/${payload.path})`,
        };
      }
      if (payload.fileKind === 'note') {
        const id = payload.id || payload.displayName;
        return { insert: `[[${payload.displayName}|${id}]]` };
      }

      return null;
    },
  };
}

export function makePeekWikiLinksConfig(): Pick<WikiLinksHostConfig, 'onHover' | 'onHoverEnd'> {
  return {
    onHover: openFromWikiLink,
    onHoverEnd: closeFromWikiLink,
  };
}

export interface MakeNewNoteMenuConfigOptions {
  campaignPath: string;
  getExistingIds?: () => ReadonlySet<string> | undefined;
  onCreated?: (note: CreatedNote) => void;
}

/**
 * Builds the `contextMenu.extraItems` config that adds a "New note…" item
 * to the editor's own menu (right-click, `/`, Shift+F10). Selecting it runs
 * `runNewNoteFromEditor`, which shows the New Note dialog (itself handling
 * conflicts and errors inline), and inserts `[[id]]` in place of the
 * acted-on range once a note comes back.
 */
export function makeNewNoteMenuConfig(opts: MakeNewNoteMenuConfigOptions): {
  extraItems: EditorMenuExtraItems;
} {
  const { campaignPath, getExistingIds, onCreated } = opts;
  return {
    extraItems: (ctx) => [
      {
        kind: 'action',
        label: 'New note…',
        keywords: ['create', 'note', 'link'],
        onSelect: () => {
          void runNewNoteFromEditor(ctx, {
            campaignPath,
            existingIds: getExistingIds?.(),
            onCreated,
          });
        },
      },
    ],
  };
}
