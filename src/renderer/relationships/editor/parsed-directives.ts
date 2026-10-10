/**
 * Parses relationship directives (`{{trackId.action ...}}`) once per document
 * change and shares the result across every extension that would otherwise
 * call `parseDirectives` on the whole buffer itself: `directives.ts`
 * (its model, guard and keymaps), `directive-completions.ts`,
 * and the generic editor (via `embeddedRanges`, so wiki links and the `/` menu
 * stay out of a directive's text).
 *
 * `parsedDirectivesField` recomputes only when `tr.docChanged` — a
 * selection-only transaction (moving the caret between blanks)
 * reuses the previous array. `directivesIn` reads the field when it's wired
 * into the editor's extension stack, and falls back to parsing directly
 * when it isn't (e.g. a unit test that mounts a single extension in
 * isolation) — see this module's own tests.
 */
import { StateField, type EditorState } from '@codemirror/state';
import { embeddedRanges } from '../../shared/markdown-editor/extensions/embedded-ranges';
import { parseDirectives, type ParsedDirective } from '../../../shared/relationships';

export const parsedDirectivesField = StateField.define<ParsedDirective[]>({
  create: (state) => parseDirectives(state.doc.toString()).directives,
  update(value, tr) {
    if (!tr.docChanged) return value;
    return parseDirectives(tr.state.doc.toString()).directives;
  },
  provide: (f) =>
    embeddedRanges.of((state) => state.field(f).map((d) => ({ from: d.from, to: d.to }))),
});

/** Every parsed directive in `state`'s document. */
export function directivesIn(state: EditorState): ParsedDirective[] {
  return (
    state.field(parsedDirectivesField, false) ?? parseDirectives(state.doc.toString()).directives
  );
}
