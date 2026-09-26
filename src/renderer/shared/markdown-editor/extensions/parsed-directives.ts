/**
 * Parses relationship directives (`{{trackId.action ...}}`) once per document
 * change and shares the result across every extension that would otherwise
 * call `parseDirectives` on the whole buffer itself: `relationship-directives.ts`
 * (decorations, the boundary/Enter keymaps, `currentDirectiveAt`),
 * `wiki-links.ts` (`directiveRanges`, to skip `[[id]]` occurrences inside a
 * directive's role tokens), `relationship-bubble-state.ts` (`bubbleStateField`'s
 * per-transaction re-validation), and `relationship-bubble-view-plugin.ts`
 * (`RelationshipBubblePlugin.sync`).
 *
 * `parsedDirectivesField` recomputes only when `tr.docChanged` — a
 * selection-only transaction (moving the caret, opening the fill-in bubble)
 * reuses the previous array. `directivesIn` reads the field when it's wired
 * into the editor's extension stack, and falls back to parsing directly
 * when it isn't (e.g. a unit test that mounts a single extension in
 * isolation) — see this module's own tests.
 */
import { StateField, type EditorState } from '@codemirror/state';
import { parseDirectives, type ParsedDirective } from '../../../../shared/relationships';

export const parsedDirectivesField = StateField.define<ParsedDirective[]>({
  create: (state) => parseDirectives(state.doc.toString()).directives,
  update(value, tr) {
    if (!tr.docChanged) return value;
    return parseDirectives(tr.state.doc.toString()).directives;
  },
});

/** Every parsed directive in `state`'s document. */
export function directivesIn(state: EditorState): ParsedDirective[] {
  return (
    state.field(parsedDirectivesField, false) ?? parseDirectives(state.doc.toString()).directives
  );
}

/**
 * The source `{from,to}` range of every directive in `state`'s document.
 * Backed by the shared field, not re-implemented per caller — `wiki-links.ts`
 * uses this to skip `[[id]]` occurrences that live inside a directive's role
 * tokens, since those render as part of the directive's own form block.
 */
export function directiveRanges(state: EditorState): { from: number; to: number }[] {
  return directivesIn(state).map((d) => ({ from: d.from, to: d.to }));
}
