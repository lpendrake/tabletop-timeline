import { notesData } from './data';
import { slugify } from './domain/slugify';
import { candidateFilename, pickUnusedId, MAX_CREATE_ATTEMPTS } from './domain/unique-filename';
import { joinFrontmatter } from '../../shared/frontmatter';
import { generateShortId } from '../../shared/ids';

export interface CreatedNote {
  id: string;
  folder: string;
  filename: string;
  title: string;
  frontmatter: string;
  body: string;
}

export interface CreateNoteOptions {
  campaignPath: string;
  folder: string;
  title: string;
  existingIds?: ReadonlySet<string>;
}

/**
 * Creates a brand-new note file. Never overwrites an existing file: on a
 * filename collision it retries with a numbered filename, and only ever
 * writes through `notesData.createNoteFile`, which itself refuses to clobber
 * an existing file.
 */
export async function createNote({
  campaignPath,
  folder,
  title,
  existingIds,
}: CreateNoteOptions): Promise<CreatedNote> {
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

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const filename = candidateFilename(slug, attempt);
    const fullPath = `${campaignPath}/notes/${folderPrefix}${filename}`;
    const result = await notesData.createNoteFile(fullPath, content);
    if (result.ok) {
      return { id, folder, filename, title: trimmedTitle, frontmatter, body };
    }
    if (result.reason === 'exists') {
      continue;
    }
    throw new Error(result.message ?? 'Failed to create note');
  }

  throw new Error(`Could not create a unique filename for "${trimmedTitle}"`);
}
