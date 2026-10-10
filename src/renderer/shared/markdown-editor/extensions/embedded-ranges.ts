import { Facet, type EditorState } from '@codemirror/state';

export interface EmbeddedRange {
  from: number;
  to: number;
}

/**
 * Spans of text that belong to an embedded syntax (for example a host's
 * directive blocks). Other extensions contribute them; generic editor
 * features (wiki links, the slash menu) stay out of them. Same shape as
 * `EditorView.atomicRanges`.
 */
export const embeddedRanges = Facet.define<(state: EditorState) => readonly EmbeddedRange[]>();

/** Every embedded range contributed to `state`, in contributor order. */
export function embeddedRangesIn(state: EditorState): EmbeddedRange[] {
  return state.facet(embeddedRanges).flatMap((contributor) => contributor(state));
}

/** True when `pos` lies strictly between the edges of an embedded range. */
export function isInsideEmbeddedRange(ranges: readonly EmbeddedRange[], pos: number): boolean {
  return ranges.some((r) => r.from < pos && pos < r.to);
}

/** True when `range` sits entirely within one embedded range (edges included). */
export function isRangeWithinEmbedded(
  ranges: readonly EmbeddedRange[],
  range: EmbeddedRange,
): boolean {
  return ranges.some((r) => range.from >= r.from && range.to <= r.to);
}
