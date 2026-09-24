import { notesData } from './data';
import { slugify } from './domain/slugify';
import { pickUnusedId } from './domain/unique-id';
import { joinFrontmatter, readFrontmatterFields } from '../../shared/frontmatter';
import { generateShortId } from '../../shared/ids';

export interface CreatedNote {
  id: string;
  folder: string;
  filename: string;
  title: string;
  frontmatter: string;
  body: string;
}

/** An existing note found at the filename the caller tried to create. */
export interface ExistingNoteConflict {
  /** Path relative to the campaign's `notes/` directory, e.g. `npcs/bob.md`. */
  path: string;
  /** The existing note's frontmatter id, or `null` if it has none. */
  id: string | null;
  title: string;
}

export type CreateNoteResult =
  | { status: 'created'; note: CreatedNote }
  | { status: 'exists'; existing: ExistingNoteConflict };

export interface CreateNoteOptions {
  campaignPath: string;
  folder: string;
  title: string;
  existingIds?: ReadonlySet<string>;
}

/**
 * Creates a brand-new note file. Tries only `slug.md` — it never overwrites
 * an existing file (writes go through `notesData.createNoteFile`, which
 * itself refuses to clobber an existing file), and never invents a numbered
 * filename on a collision. On a collision it reports the existing file
 * instead, so the caller can offer to link to it. Throws only on a real
 * write error.
 */
export async function createNote({
  campaignPath,
  folder,
  title,
  existingIds,
}: CreateNoteOptions): Promise<CreateNoteResult> {
  const trimmedTitle = title.trim();
  const slug = slugify(trimmedTitle);
  if (!slug) {
    throw new Error('Title must contain letters or numbers');
  }

  const id = pickUnusedId(generateShortId, existingIds);
  const frontmatter = `id: ${id}\ntitle: ${trimmedTitle}`;
  const body = `# ${trimmedTitle}\n\n`;
  const content = joinFrontmatter(frontmatter, body);
  const folderPrefix = folder ? `${folder}/` : '';
  const filename = `${slug}.md`;
  const relativePath = `${folderPrefix}${filename}`;
  const fullPath = `${campaignPath}/notes/${relativePath}`;

  const result = await notesData.createNoteFile(fullPath, content);
  if (result.ok) {
    return {
      status: 'created',
      note: { id, folder, filename, title: trimmedTitle, frontmatter, body },
    };
  }
  if (result.reason !== 'exists') {
    throw new Error(result.message ?? 'Failed to create note');
  }

  const raw = await notesData.readNote(fullPath);
  const { id: existingId, title: existingTitle } = raw
    ? readFrontmatterFields(raw)
    : { id: null, title: null };

  return {
    status: 'exists',
    existing: { path: relativePath, id: existingId, title: existingTitle ?? filename },
  };
}
