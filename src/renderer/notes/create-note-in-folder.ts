import { createNote, type CreatedNote } from './create-note';
import type { EntityIndexEntry } from '../../types/global';

export interface CreateNoteInFolderOptions {
  campaignPath: string;
  /** Top-level sidebar folder. */
  folder: string;
  /** Nested path under `folder`, if the note is being created in a subfolder. */
  subdir?: string;
  /** Raw name typed into the sidebar's "New note" input; becomes the note's title. */
  name: string;
  entityIndex?: readonly EntityIndexEntry[];
}

export type CreateNoteInFolderResult =
  | { status: 'created'; note: CreatedNote }
  | { status: 'exists'; message: string };

/**
 * Creates a note from the sidebar's "New note" flow. Maps the sidebar's
 * `{ folder, subdir, name }` shape onto `createNote`'s `{ folder, title }`
 * (the note's full folder path is `folder` + `subdir` joined), so the
 * sidebar and the editor's "New note…" menu share the exact same
 * create-only write path and never overwrite an existing file.
 *
 * Returns `null` when `name` is blank — nothing to create.
 */
export async function createNoteInFolder({
  campaignPath,
  folder,
  subdir,
  name,
  entityIndex,
}: CreateNoteInFolderOptions): Promise<CreateNoteInFolderResult | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const noteFolder = subdir ? `${folder}/${subdir}` : folder;
  const result = await createNote({
    campaignPath,
    folder: noteFolder,
    title: trimmed,
    entityIndex,
  });

  if (result.status === 'exists') {
    return {
      status: 'exists',
      message: `A note called "${result.existing.title}" already exists in ${noteFolder}`,
    };
  }
  return { status: 'created', note: result.note };
}
