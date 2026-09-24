import { notesData } from './data';

function isSkippedFolderName(name: string): boolean {
  return name === 'assets' || name.startsWith('.');
}

async function collectFolders(dirPath: string, relativePrefix: string, out: string[]) {
  let entries: { name: string; isDirectory: boolean; path: string }[];
  try {
    entries = await notesData.listFolder(dirPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory || isSkippedFolderName(entry.name)) continue;
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    out.push(relativePath);
    await collectFolders(`${dirPath}/${entry.name}`, relativePath, out);
  }
}

/**
 * Lists every folder path under `<campaignPath>/notes/`, relative to the
 * notes root, including intermediate folders (e.g. both `factions` and
 * `factions/the-house-of-storms`). Skips `assets` and hidden (dot) folders.
 * The notes root itself is not included — callers represent it as `''`.
 */
export async function listNoteFolders(campaignPath: string): Promise<string[]> {
  const notesRoot = `${campaignPath}/notes`;
  const folders: string[] = [];
  await collectFolders(notesRoot, '', folders);
  return folders.sort();
}
