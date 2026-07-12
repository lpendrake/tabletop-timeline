import { linesInRange } from './toggle-block';

/**
 * Resolves the text a right-click "Copy" action should place on the
 * clipboard:
 * - Non-empty range [from, to) → the text within that range.
 * - Empty range (caret, from === to) → the full text of the line
 *   containing the caret.
 */
export function resolveCopyTarget(text: string, from: number, to: number): string {
  if (from !== to) return text.slice(from, to);
  const [line] = linesInRange(text, from, to);
  return line?.text ?? '';
}
