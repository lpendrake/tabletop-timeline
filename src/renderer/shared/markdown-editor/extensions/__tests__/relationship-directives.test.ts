// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo, cursorCharRight } from '@codemirror/commands';
import {
  relationshipDirectives,
  setDirectiveContext,
  crossEnd,
  directiveBorderClass,
  getDirectiveRootElement,
  type RelationshipDirectivesConfig,
} from '../relationship-directives';
import { directiveFormStateField, closeFormEffect } from '../relationship-directive-form-plugin';
import { wikiLinks, setEntityLabels, type WikiLinksConfig } from '../wiki-links';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
} from '../../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
const GAINS_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'gains')!.template;

const FULL_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

const UNFINISHED_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

const EMPTY_REASON_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
});

const UNKNOWN_TRACK_DIRECTIVE = serialiseTemplate('rp99', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'x',
});

const UNKNOWN_OPTION_DIRECTIVE = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, {
  holder: '[[a1b2]]',
  option: 'boss',
  observer: '[[c3d4]]',
  reason: 'x',
});

const EMPTY_REASON_TAG_DIRECTIVE = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, {
  holder: '[[c3d4]]',
  option: 'member',
  observer: '[[a1b2]]',
});

const FILLED_REASON_TAG_DIRECTIVE = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, {
  holder: '[[c3d4]]',
  option: 'member',
  observer: '[[a1b2]]',
  reason: 'signed the deal',
});

const LABELS = new Map([
  ['a1b2', 'White Tigers'],
  ['c3d4', 'The Party'],
]);

interface Setup {
  view: EditorView;
  container: HTMLDivElement;
}

function makeView(
  doc: string,
  config: RelationshipDirectivesConfig = { place: 'event' },
  options: {
    defaultReason?: string;
    labels?: Map<string, string>;
    readOnly?: boolean;
    withWikiLinks?: WikiLinksConfig;
    dispatchContext?: boolean;
  } = {},
): Setup {
  const { defaultReason, labels, readOnly, withWikiLinks, dispatchContext = true } = options;
  const extensions = [history(), relationshipDirectives(config), directiveFormStateField];
  if (withWikiLinks) extensions.push(wikiLinks(withWikiLinks));
  if (readOnly) extensions.push(EditorState.readOnly.of(true));

  const state = EditorState.create({ doc, extensions });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView({ state, parent: container });

  if (dispatchContext) {
    view.dispatch({
      effects: setDirectiveContext.of({
        library: { custom: [], optionAdditions: {} },
        defaultReason: defaultReason ?? 'Unspecified',
      }),
    });
  }
  if (labels) {
    view.dispatch({ effects: setEntityLabels.of(labels) });
  }

  return { view, container };
}

function destroy({ view, container }: Setup) {
  view.destroy();
  container.remove();
}

let cleanup: Setup[] = [];
afterEach(() => {
  cleanup.forEach(destroy);
  cleanup = [];
  vi.restoreAllMocks();
});

function track(setup: Setup): Setup {
  cleanup.push(setup);
  return setup;
}

function block(view: EditorView): HTMLElement {
  const el = view.dom.querySelector<HTMLElement>('.cm-directive');
  if (!el) throw new Error('no .cm-directive block rendered');
  return el;
}

function fireClick(target: HTMLElement, opts: { ctrlKey?: boolean; metaKey?: boolean } = {}): void {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
  });
  target.dispatchEvent(event);
}

/** Fires a real `pointerdown` (as the browser does ahead of `mousedown`/`click`) and returns it so callers can inspect `defaultPrevented`. */
function firePointerDown(
  target: HTMLElement,
  opts: { ctrlKey?: boolean; metaKey?: boolean } = {},
): PointerEvent {
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
  });
  target.dispatchEvent(event);
  return event;
}

/** Fires a real `mousedown`, as CodeMirror itself listens for, and returns it. */
function fireMouseDown(
  target: HTMLElement,
  opts: { ctrlKey?: boolean; metaKey?: boolean } = {},
): MouseEvent {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
  });
  target.dispatchEvent(event);
  return event;
}

function fireKey(view: EditorView, key: string): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
}

describe('relationship directives — readable rendering', () => {
  it('renders only the readable sentence, no ids or envelope', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.textContent).toBe(
      'Rep change: -2 White Tigers rep for The Party — attacked their warehouse',
    );
    expect(el.textContent).not.toContain('rp01');
    expect(el.textContent).not.toContain('{');
    expect(el.textContent).not.toContain('[[');
  });

  it('never reveals raw text when the caret moves across or a selection covers the block', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const before = block(view).outerHTML;
    const lineTextBefore = view.state.doc.toString();
    const len = view.state.doc.length;

    for (let pos = 0; pos <= len; pos++) {
      view.dispatch({ selection: { anchor: pos } });
      expect(block(view).outerHTML).toBe(before);
    }

    view.dispatch({ selection: { anchor: 0, head: len } });
    expect(block(view).outerHTML).toBe(before);
    expect(view.state.doc.toString()).toBe(lineTextBefore);
  });

  it('caret moves over a block as one unit', () => {
    const setup = track(
      makeView(`x ${FULL_CHANGE_DIRECTIVE} y`, { place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const from = 2;
    const to = 2 + FULL_CHANGE_DIRECTIVE.length;

    view.dispatch({ selection: { anchor: from } });
    cursorCharRight(view);
    expect(view.state.selection.main.head).toBe(to);
  });
});

describe('relationship directives — DOM is not a data source', () => {
  it('block click handlers use editor state, not DOM attributes', () => {
    const setup = track(
      makeView(`before ${UNFINISHED_CHANGE_DIRECTIVE}`, { place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const el = block(view);

    // None of the old data-* identity attributes are present anywhere in the block.
    expect(el.outerHTML).not.toContain('data-from');
    expect(el.outerHTML).not.toContain('data-to');
    expect(el.outerHTML).not.toContain('data-ordinal');
    expect(el.outerHTML).not.toContain('data-role');
    expect(el.outerHTML).not.toContain('data-note-id');

    // Insert text above the directive — its position shifts — then click still
    // routes correctly, because the widget re-resolves its own current range
    // from editor state rather than trusting numbers captured at render time.
    view.dispatch({ changes: { from: 0, insert: 'more ' } });
    const shiftedFrom = 'more before '.length;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;
    fireClick(holderValue);
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: shiftedFrom });
  });
});

describe('relationship directives — deletion', () => {
  it('Backspace after a block selects it, a second Backspace deletes it; Ctrl+Z restores', () => {
    const original = `${FULL_CHANGE_DIRECTIVE} tail`;
    const setup = track(makeView(original, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const to = FULL_CHANGE_DIRECTIVE.length;

    view.dispatch({ selection: { anchor: to } });
    fireKey(view, 'Backspace');
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(to);
    expect(view.state.doc.toString()).toBe(original);

    fireKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(' tail');

    undo(view);
    expect(view.state.doc.toString()).toBe(original);
  });

  it('Delete before a block selects then deletes', () => {
    const original = `head ${FULL_CHANGE_DIRECTIVE}`;
    const setup = track(makeView(original, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const from = 'head '.length;

    view.dispatch({ selection: { anchor: from } });
    fireKey(view, 'Delete');
    expect(view.state.selection.main.from).toBe(from);
    expect(view.state.selection.main.to).toBe(from + FULL_CHANGE_DIRECTIVE.length);
    expect(view.state.doc.toString()).toBe(original);

    fireKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe('head ');
  });

  it('clicking the delete cross removes the directive in one undo step', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const cross = block(view).querySelector<HTMLElement>('.cm-directive-cross');
    expect(cross).not.toBeNull();

    fireClick(cross!);
    expect(view.state.doc.toString()).toBe('');

    undo(view);
    expect(view.state.doc.toString()).toBe(FULL_CHANGE_DIRECTIVE);
    redo(view);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('crossEnd — hysteresis (pure)', () => {
  it("cross end hysteresis doesn't flicker around the middle", () => {
    expect(crossEnd(0.45, 'start')).toBe('start');
    expect(crossEnd(0.55, 'start')).toBe('start');
    expect(crossEnd(0.45, 'end')).toBe('end');
    expect(crossEnd(0.55, 'end')).toBe('end');

    // Only switches once clearly past the threshold.
    expect(crossEnd(0.65, 'start')).toBe('end');
    expect(crossEnd(0.35, 'end')).toBe('start');

    // Exactly at the threshold switches.
    expect(crossEnd(0.4, 'end')).toBe('start');
    expect(crossEnd(0.6, 'start')).toBe('end');
  });
});

describe('directiveBorderClass (pure)', () => {
  it('maps each interpreted status to its outline class', () => {
    expect(directiveBorderClass('unfinished')).toBe('cm-directive-unfinished');
    expect(directiveBorderClass('invalid')).toBe('cm-directive-error');
    expect(directiveBorderClass('ok')).toBeNull();
  });
});

describe('relationship directives — Ctrl/Cmd+click reliability on a value', () => {
  it('root-causes the flakiness: an unguarded mousedown on a value snaps the selection over the whole block before any click fires', () => {
    // This is what makes acting only on `click` unreliable: `ignoreEvent()`
    // is `false` for the atomic directive decoration, so CodeMirror's own
    // mousedown handling runs first and (since the block is atomic) expands
    // the selection to cover the entire directive — a real, observable
    // mutation that happens strictly between mousedown and click, in a
    // browser sometimes racing with (or pre-empting) the click that would
    // otherwise reach the value span's own listener.
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
    fireMouseDown(holderValue, { ctrlKey: true });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(FULL_CHANGE_DIRECTIVE.length);
  });

  it('guards the modified pointerdown so CodeMirror never gets a chance to move the caret', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    const event = firePointerDown(holderValue, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('a plain pointerdown on a value is also guarded — CodeMirror must never get first crack at it', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    const event = firePointerDown(holderValue);
    expect(event.defaultPrevented).toBe(true);
  });

  it('a plain pointerdown on the block wording (not a value) is guarded too', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const el = block(view);
    // Fire on the block root itself (the block's one click target), not a `.cm-directive-value` child.
    const event = firePointerDown(el);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Ctrl/Cmd+click reliably opens the note — pointerdown guarded, click never lands on the wrong thing', () => {
    const onOpenNote = vi.fn();
    const setup = track(
      makeView(FULL_CHANGE_DIRECTIVE, { onOpenNote, place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    // The real fixed sequence: the guarded pointerdown prevents CodeMirror's
    // compatibility mousedown from ever being dispatched, so only pointerdown
    // then click occur — never a selection-moving mousedown in between.
    firePointerDown(holderValue, { ctrlKey: true });
    fireClick(holderValue, { ctrlKey: true });

    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(view.state.field(directiveFormStateField)).toBeNull();
    // The selection was never hijacked by CodeMirror along the way.
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
  });

  // An unguarded mousedown on the atomic block — plain or modified — snaps
  // the selection over the whole directive before any `click` fires. On a
  // real browser that selection-driven update forces CodeMirror to rebuild
  // the block's widget DOM mid-gesture, detaching the exact node the
  // mousedown landed on; since a `click` is only synthesised when mousedown
  // and mouseup share a target, the click is silently dropped and the first
  // click on a directive never opens its form — only a second click
  // (mousedown on the now-settled, already-rebuilt node) succeeds. These
  // tests prove the fix: guarding every plain pointerdown on the block (not
  // just modified ones) keeps CodeMirror from ever touching the selection,
  // so a single click is reliable.
  it('guarding the plain pointerdown keeps the selection untouched, so a single click reliably opens the form', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    // The guarded pointerdown is prevented, so on a real browser the
    // compatibility mousedown is never dispatched at all — simulated here by
    // simply never firing `fireMouseDown`, exactly like the existing
    // Ctrl/Cmd+click regression test above.
    const pointerDown = firePointerDown(holderValue);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireClick(holderValue);

    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
    // The selection was never hijacked by CodeMirror along the way, so there
    // is no widget rebuild for the click to race against.
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
  });

  it('guarding a plain pointerdown on the wording (no value under the cursor) also keeps a single click working', () => {
    const setup = track(
      makeView(UNFINISHED_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const el = block(view);

    const pointerDown = firePointerDown(el);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireClick(el);

    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
  });

  it('plain click still opens the form; Ctrl/Cmd+click never does', () => {
    const onOpenNote = vi.fn();
    const setup = track(
      makeView(FULL_CHANGE_DIRECTIVE, { onOpenNote, place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    firePointerDown(holderValue);
    fireClick(holderValue);
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
    expect(onOpenNote).not.toHaveBeenCalled();

    view.dispatch({ effects: closeFormEffect.of(null) });

    firePointerDown(holderValue, { ctrlKey: true });
    fireClick(holderValue, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
    expect(view.state.field(directiveFormStateField)).toBeNull();
  });
});

describe('relationship directives — editing callbacks', () => {
  it('the whole block is one click target: a value, the wording, or any other spot all open the same form once', () => {
    const setup = track(
      makeView(UNFINISHED_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;

    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;
    fireClick(holderValue);
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });

    view.dispatch({ effects: closeFormEffect.of(null) });
    fireClick(block(view));
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
  });

  it('Ctrl+click on a holder calls onOpenNote; plain click opens the form instead', () => {
    const onOpenNote = vi.fn();
    const setup = track(
      makeView(FULL_CHANGE_DIRECTIVE, { onOpenNote, place: 'event' }, { labels: LABELS }),
    );
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    fireClick(holderValue);
    expect(onOpenNote).not.toHaveBeenCalled();
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });

    view.dispatch({ effects: closeFormEffect.of(null) });
    fireClick(holderValue, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
    expect(view.state.field(directiveFormStateField)).toBeNull();
  });

  it('unfinished blanks show their prompt with the attention class, and the block outlined in warning', () => {
    const setup = track(
      makeView(UNFINISHED_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }),
    );
    const el = block(setup.view);
    const amountValue = el.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;
    expect(amountValue.classList.contains('cm-directive-value-attention')).toBe(true);
    expect(amountValue.textContent).toBe('Reputation change');

    expect(el.classList.contains('cm-directive-unfinished')).toBe(true);
    expect(el.classList.contains('cm-directive-error')).toBe(false);
  });

  it('a complete, valid directive gets neither the warning nor the danger outline class', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.classList.contains('cm-directive-unfinished')).toBe(false);
    expect(el.classList.contains('cm-directive-error')).toBe(false);
  });

  it('empty reason shows the host default reason', () => {
    const withHost = track(
      makeView(
        EMPTY_REASON_DIRECTIVE,
        { place: 'event' },
        { labels: LABELS, defaultReason: 'Battle of Dawn' },
      ),
    );
    const reasonValue = block(withHost.view).querySelector<HTMLElement>(
      '.cm-directive-value-role-reason',
    )!;
    expect(reasonValue.textContent).toBe('Battle of Dawn');

    const withoutHost = track(
      makeView(
        EMPTY_REASON_DIRECTIVE,
        { place: 'event' },
        { labels: LABELS, dispatchContext: false },
      ),
    );
    const defaultReasonValue = block(withoutHost.view).querySelector<HTMLElement>(
      '.cm-directive-value-role-reason',
    )!;
    expect(defaultReasonValue.textContent).toBe('Unspecified');
  });

  it('a note with an empty reason renders "Unspecified" with a reason value element', () => {
    const setup = track(
      makeView(EMPTY_REASON_TAG_DIRECTIVE, { place: 'note' }, { labels: LABELS }),
    );
    const el = block(setup.view);
    const reasonValue = el.querySelector<HTMLElement>('.cm-directive-value-role-reason');
    expect(reasonValue).not.toBeNull();
    expect(reasonValue?.textContent).toBe('Unspecified');
    expect(el.textContent).toContain('—');
  });

  it('a note with a filled reason still shows it', () => {
    const setup = track(
      makeView(FILLED_REASON_TAG_DIRECTIVE, { place: 'note' }, { labels: LABELS }),
    );
    const el = block(setup.view);
    const reasonValue = el.querySelector<HTMLElement>('.cm-directive-value-role-reason');
    expect(reasonValue?.textContent).toBe('signed the deal');
  });

  it('an event with an empty reason still shows the event title', () => {
    const setup = track(
      makeView(
        EMPTY_REASON_TAG_DIRECTIVE,
        { place: 'event' },
        { labels: LABELS, defaultReason: 'Battle of Dawn' },
      ),
    );
    const el = block(setup.view);
    const reasonValue = el.querySelector<HTMLElement>('.cm-directive-value-role-reason');
    expect(reasonValue?.textContent).toBe('Battle of Dawn');
  });
});

describe('relationship directives — errors', () => {
  it('unknown track shows raw content with error border and title', () => {
    const setup = track(makeView(UNKNOWN_TRACK_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.classList.contains('cm-directive-error')).toBe(true);
    expect(el.textContent).toBe(UNKNOWN_TRACK_DIRECTIVE);
    expect(el.title).toBe('Relationship track rp99 not found');
  });

  it('unknown option shows the sentence with the bad value marked, and the block outlined in danger', () => {
    const setup = track(makeView(UNKNOWN_OPTION_DIRECTIVE, { place: 'event' }, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.classList.contains('cm-directive-error')).toBe(true);
    expect(el.textContent).toContain('relationship: boss →');

    const optionValue = el.querySelector<HTMLElement>('.cm-directive-value-role-option')!;
    expect(optionValue.classList.contains('cm-directive-value-error')).toBe(true);
    expect(optionValue.title).toBe('Unknown option "boss" for Relationship tags');
  });
});

describe('relationship directives — wiki-link interop', () => {
  it('wiki-link decorations never render inside a block', () => {
    const doc = `See [[e5f6]] also ${FULL_CHANGE_DIRECTIVE}`;
    const setup = track(makeView(doc, { place: 'event' }, { labels: LABELS, withWikiLinks: {} }));
    const { view } = setup;
    const el = block(view);
    expect(el.querySelector('.cm-note-link')).toBeNull();
    expect(el.querySelector('.cm-wiki-link-raw')).toBeNull();
    expect(view.dom.querySelector('.cm-note-link')).not.toBeNull();
  });
});

describe('relationship directives — per-view root element registry', () => {
  it("scopes each block's registered root element per EditorView, even for identical documents", () => {
    const setupA = track(
      makeView(UNFINISHED_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }),
    );
    const setupB = track(
      makeView(UNFINISHED_CHANGE_DIRECTIVE, { place: 'event' }, { labels: LABELS }),
    );

    const elA = getDirectiveRootElement(setupA.view, 0);
    const elB = getDirectiveRootElement(setupB.view, 0);

    expect(elA).not.toBeNull();
    expect(elB).not.toBeNull();
    expect(elA).not.toBe(elB);
    expect(setupA.view.dom.contains(elA!)).toBe(true);
    expect(setupB.view.dom.contains(elA!)).toBe(false);
    expect(setupB.view.dom.contains(elB!)).toBe(true);
    expect(setupA.view.dom.contains(elB!)).toBe(false);

    // Destroying view B's widgets (via view.destroy(), which the harness
    // does through `track`/`afterEach`) must not clobber view A's entry.
    setupB.view.destroy();
    expect(getDirectiveRootElement(setupA.view, 0)).toBe(elA);
    expect(getDirectiveRootElement(setupB.view, 0)).toBeNull();

    // Prevent the shared afterEach cleanup from destroying setupB's view twice.
    cleanup = cleanup.filter((s) => s !== setupB);
    setupB.container.remove();
  });
});

describe('relationship directives — read-only', () => {
  it('renders blocks without the cross; Ctrl+click still opens', () => {
    const onOpenNote = vi.fn();
    const setup = track(
      makeView(
        FULL_CHANGE_DIRECTIVE,
        { readOnly: true, onOpenNote, place: 'event' },
        { labels: LABELS, readOnly: true },
      ),
    );
    const el = block(setup.view);
    expect(el.querySelector('.cm-directive-cross')).toBeNull();

    const holderValue = el.querySelector<HTMLElement>('.cm-directive-value-role-holder')!;
    fireClick(holderValue, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
  });

  it('a plain click never opens the form', () => {
    const setup = track(
      makeView(
        FULL_CHANGE_DIRECTIVE,
        { readOnly: true, place: 'event' },
        { labels: LABELS, readOnly: true },
      ),
    );
    const { view } = setup;
    fireClick(block(view));
    expect(view.state.field(directiveFormStateField)).toBeNull();
  });
});
