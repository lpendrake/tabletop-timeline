import matter from 'gray-matter';
import { generateShortId } from './ids.js';

export interface NoteFrontmatter {
  id: string;
  title: string;
  [key: string]: unknown;
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  body: string;
  /** True if id or title was auto-generated — caller should write back to disk */
  needsWrite: boolean;
}

/**
 * Parse markdown content, normalizing frontmatter to ensure id and title exist.
 * Does not touch the filesystem — caller is responsible for persisting if needsWrite is true.
 */
export function parseNote(content: string, fallbackTitle: string): ParsedNote {
  const { data, content: body } = matter(content);

  const hadId = Boolean(data.id);
  const hadTitle = Boolean(data.title ?? data.name);

  const id = hadId ? String(data.id) : generateShortId();
  const storedTitle = hadTitle ? String(data.title ?? data.name) : null;
  const h1 = extractH1(body);
  // H1 is the source of truth when present; frontmatter title is the fallback
  const title = h1 ?? storedTitle ?? fallbackTitle;

  // Write back when id or title is missing, or when H1 has diverged from the stored frontmatter title
  const needsWrite = !hadId || !hadTitle || (h1 !== null && h1 !== storedTitle);

  const frontmatter: NoteFrontmatter = { ...data, id, title };
  return { frontmatter, body, needsWrite };
}

/** Serialize body + frontmatter back to a markdown string. */
export function stringifyNote(body: string, frontmatter: Record<string, unknown>): string {
  return matter.stringify(body, frontmatter);
}

/**
 * Split a raw file string into its YAML frontmatter and markdown body.
 * The returned `frontmatter` is the raw YAML content WITHOUT the `---` delimiters.
 * Returns `frontmatter: ''` when no frontmatter block is present.
 * This is the canonical split used by the renderer to keep the two parts separate
 * in memory — the editor only ever receives and modifies `body`.
 */
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1], body: raw.slice(match[0].length) };
}

/**
 * Recombine a frontmatter string and body into a file-ready string.
 * If `frontmatter` is empty the `---` block is omitted.
 */
export function joinFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter.trim()) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}

/**
 * Reads the id/title frontmatter fields from a raw file's content without
 * generating fallbacks — unlike `parseNote`, a missing id comes back as
 * `null` rather than a freshly generated one. Used when reporting on an
 * *existing* file rather than normalizing one that will be saved.
 *
 * Renderer-safe: parses the frontmatter block as plain text (via
 * `splitFrontmatter`) rather than using `gray-matter`, which needs Node's
 * `Buffer` — unavailable in the Electron renderer.
 */
export function readFrontmatterFields(raw: string): { id: string | null; title: string | null } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const { frontmatter } = splitFrontmatter(normalized);

  let id: string | null = null;
  let title: string | null = null;
  let name: string | null = null;

  for (const line of frontmatter.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = parseFrontmatterScalar(rawValue);
    if (key === 'id') id = value;
    else if (key === 'title') title = value;
    else if (key === 'name') name = value;
  }

  return { id, title: title ?? name };
}

/** Parses a single YAML scalar value as it appears after `key:` on a frontmatter line. */
function parseFrontmatterScalar(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (trimmed === '') return null;

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function extractH1(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : null;
}
