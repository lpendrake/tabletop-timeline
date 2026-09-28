/**
 * The editor's one autocompletion host. CodeMirror's `autocompletion()` config
 * can only carry a single `override` source list — two extensions each calling
 * `autocompletion({ override: [...] })` with different lists throw a config
 * merge conflict. So every extension that wants completions registers its
 * source on `completionSources` instead, and includes `editorAutocompletion`
 * (the same extension instance everywhere, so CodeMirror dedupes it).
 *
 * Sources are asked in precedence order and the first non-null result wins,
 * so a more specific source (a relationship directive's blank) can be
 * registered with a higher `Prec` than a general one (`[[` / `@` links).
 */
import {
  autocompletion,
  completionStatus,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { Facet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Register a completion source with the shared autocompletion host. */
export const completionSources = Facet.define<CompletionSource>();

/**
 * Completions that set this on themselves (via `completionReactivates`)
 * reopen the list at the caret right after they're picked — used by a
 * directive blank, whose pick moves the caret on to the next blank.
 */
const reactivating = new WeakSet<Completion>();

/** Marks `completion` so picking it reopens completions wherever the caret lands. */
export function completionReactivates<T extends Completion>(completion: T): T {
  reactivating.add(completion);
  return completion;
}

async function firstResult(context: CompletionContext): Promise<CompletionResult | null> {
  for (const source of context.state.facet(completionSources)) {
    const result = await source(context);
    if (context.aborted) return null;
    if (result) return result;
  }
  return null;
}

const OVERRIDE: readonly CompletionSource[] = [firstResult];

export const editorAutocompletion = autocompletion({
  activateOnTyping: true,
  icons: false,
  override: OVERRIDE as CompletionSource[],
  activateOnCompletion: (completion) => reactivating.has(completion),
});

/**
 * Whether the editor that `target` (a keydown's target) belongs to has a
 * completion list open — used by hosts with their own document-level Escape
 * handling (e.g. `EventEditorModal`) so the Escape that closes the list
 * doesn't also close the host. Resolved through CodeMirror's own
 * DOM-to-view lookup, not a DOM attribute.
 */
export function isEditorPopupOpen(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editor = target.closest<HTMLElement>('.cm-editor');
  const view = editor ? EditorView.findFromDOM(editor) : null;
  return view ? completionStatus(view.state) === 'active' : false;
}
