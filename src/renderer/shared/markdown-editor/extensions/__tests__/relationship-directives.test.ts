// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo, cursorCharRight } from '@codemirror/commands';
import {
  relationshipDirectives,
  setDirectiveContext,
  firstEditRole,
  crossEnd,
  type RelationshipDirectivesConfig,
} from '../relationship-directives';
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
  config: RelationshipDirectivesConfig = {},
  options: {
    defaultReason?: string;
    labels?: Map<string, string>;
    readOnly?: boolean;
    withWikiLinks?: WikiLinksConfig;
    dispatchContext?: boolean;
  } = {},
): Setup {
  const { defaultReason, labels, readOnly, withWikiLinks, dispatchContext = true } = options;
  const extensions = [history(), relationshipDirectives(config)];
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

function fireKey(view: EditorView, key: string): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
}

describe('relationship directives — readable rendering', () => {
  it('renders only the readable sentence, no ids or envelope', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, {}, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.textContent).toBe(
      'Rep change: -2 White Tigers rep for The Party — attacked their warehouse',
    );
    expect(el.textContent).not.toContain('rp01');
    expect(el.textContent).not.toContain('{');
    expect(el.textContent).not.toContain('[[');
  });

  it('never reveals raw text when the caret moves across or a selection covers the block', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, {}, { labels: LABELS }));
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
    const setup = track(makeView(`x ${FULL_CHANGE_DIRECTIVE} y`, {}, { labels: LABELS }));
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
    const onEditField = vi.fn();
    const setup = track(
      makeView(`before ${UNFINISHED_CHANGE_DIRECTIVE}`, { onEditField }, { labels: LABELS }),
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
    expect(onEditField).toHaveBeenCalledWith({ from: shiftedFrom, ordinal: 0 }, 'holder');
  });
});

describe('relationship directives — deletion', () => {
  it('Backspace after a block selects it, a second Backspace deletes it; Ctrl+Z restores', () => {
    const original = `${FULL_CHANGE_DIRECTIVE} tail`;
    const setup = track(makeView(original, {}, { labels: LABELS }));
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
    const setup = track(makeView(original, {}, { labels: LABELS }));
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
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, {}, { labels: LABELS }));
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

describe('firstEditRole (pure)', () => {
  it('picks the first empty value, falling back to the first value', () => {
    expect(
      firstEditRole([
        { kind: 'text', text: 'a' },
        { kind: 'value', role: 'holder', tokenIndex: 0, display: 'x', empty: false },
        { kind: 'value', role: 'amount', tokenIndex: 1, display: '', empty: true },
      ]),
    ).toBe('amount');

    expect(
      firstEditRole([
        { kind: 'value', role: 'holder', tokenIndex: 0, display: 'x', empty: false },
        { kind: 'value', role: 'observer', tokenIndex: 1, display: 'y', empty: false },
      ]),
    ).toBe('holder');

    expect(firstEditRole([{ kind: 'text', text: 'a' }])).toBeNull();
  });
});

describe('relationship directives — editing callbacks', () => {
  it('clicking a value calls onEditField with its role; clicking wording targets the first empty blank', () => {
    const onEditField = vi.fn();
    const setup = track(makeView(UNFINISHED_CHANGE_DIRECTIVE, { onEditField }, { labels: LABELS }));
    const { view } = setup;

    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;
    fireClick(holderValue);
    expect(onEditField).toHaveBeenCalledWith({ from: 0, ordinal: 0 }, 'holder');

    onEditField.mockClear();
    fireClick(block(view));
    expect(onEditField).toHaveBeenCalledWith({ from: 0, ordinal: 0 }, 'amount');
  });

  it('Ctrl+click on a holder calls onOpenNote; plain click does not', () => {
    const onOpenNote = vi.fn();
    const onEditField = vi.fn();
    const setup = track(
      makeView(FULL_CHANGE_DIRECTIVE, { onOpenNote, onEditField }, { labels: LABELS }),
    );
    const { view } = setup;
    const holderValue = block(view).querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    fireClick(holderValue);
    expect(onOpenNote).not.toHaveBeenCalled();
    expect(onEditField).toHaveBeenCalledWith({ from: 0, ordinal: 0 }, 'holder');

    onEditField.mockClear();
    fireClick(holderValue, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
    expect(onEditField).not.toHaveBeenCalled();
  });

  it('unfinished blanks show their prompt with the attention class', () => {
    const setup = track(makeView(UNFINISHED_CHANGE_DIRECTIVE, {}, { labels: LABELS }));
    const amountValue = block(setup.view).querySelector<HTMLElement>(
      '.cm-directive-value-role-amount',
    )!;
    expect(amountValue.classList.contains('cm-directive-value-attention')).toBe(true);
    expect(amountValue.textContent).toBe('Reputation change');
  });

  it('empty reason shows the host default reason', () => {
    const withHost = track(
      makeView(EMPTY_REASON_DIRECTIVE, {}, { labels: LABELS, defaultReason: 'Battle of Dawn' }),
    );
    const reasonValue = block(withHost.view).querySelector<HTMLElement>(
      '.cm-directive-value-role-reason',
    )!;
    expect(reasonValue.textContent).toBe('Battle of Dawn');

    const withoutHost = track(
      makeView(EMPTY_REASON_DIRECTIVE, {}, { labels: LABELS, dispatchContext: false }),
    );
    const defaultReasonValue = block(withoutHost.view).querySelector<HTMLElement>(
      '.cm-directive-value-role-reason',
    )!;
    expect(defaultReasonValue.textContent).toBe('Unspecified');
  });
});

describe('relationship directives — errors', () => {
  it('unknown track shows raw content with error border and title', () => {
    const setup = track(makeView(UNKNOWN_TRACK_DIRECTIVE, {}, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.classList.contains('cm-directive-error')).toBe(true);
    expect(el.textContent).toBe(UNKNOWN_TRACK_DIRECTIVE);
    expect(el.title).toBe('Relationship track rp99 not found');
  });

  it('unknown option shows the sentence with the bad value marked', () => {
    const setup = track(makeView(UNKNOWN_OPTION_DIRECTIVE, {}, { labels: LABELS }));
    const el = block(setup.view);
    expect(el.classList.contains('cm-directive-error')).toBe(false);
    expect(el.textContent).toContain('is now boss with');

    const optionValue = el.querySelector<HTMLElement>('.cm-directive-value-role-option')!;
    expect(optionValue.classList.contains('cm-directive-value-error')).toBe(true);
    expect(optionValue.title).toBe('Unknown option "boss" for Relationship tags');
  });
});

describe('relationship directives — wiki-link interop', () => {
  it('wiki-link decorations never render inside a block', () => {
    const doc = `See [[e5f6]] also ${FULL_CHANGE_DIRECTIVE}`;
    const setup = track(makeView(doc, {}, { labels: LABELS, withWikiLinks: {} }));
    const { view } = setup;
    const el = block(view);
    expect(el.querySelector('.cm-note-link')).toBeNull();
    expect(el.querySelector('.cm-wiki-link-raw')).toBeNull();
    expect(view.dom.querySelector('.cm-note-link')).not.toBeNull();
  });
});

describe('relationship directives — read-only', () => {
  it('renders blocks without the cross; Ctrl+click still opens', () => {
    const onOpenNote = vi.fn();
    const setup = track(
      makeView(
        FULL_CHANGE_DIRECTIVE,
        { readOnly: true, onOpenNote },
        { labels: LABELS, readOnly: true },
      ),
    );
    const el = block(setup.view);
    expect(el.querySelector('.cm-directive-cross')).toBeNull();

    const holderValue = el.querySelector<HTMLElement>('.cm-directive-value-role-holder')!;
    fireClick(holderValue, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
  });
});
