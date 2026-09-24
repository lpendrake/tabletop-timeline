import * as fs from 'node:fs';
import * as path from 'node:path';

export type WriteNewFileResult =
  | { ok: true }
  | { ok: false; reason: 'exists' | 'error'; message?: string };

/**
 * Writes `content` to `fullPath`, creating parent folders as needed, but NEVER
 * overwrites an existing file. Uses the 'wx' flag so file creation is atomic:
 * if the file already exists, the write fails and the existing file is left
 * byte-for-byte unchanged.
 */
export function writeNewFile(fullPath: string, content: string): WriteNewFileResult {
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, { encoding: 'utf-8', flag: 'wx' });
    return { ok: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return { ok: false, reason: 'exists' };
    }
    console.error('Failed to write new file:', error);
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
