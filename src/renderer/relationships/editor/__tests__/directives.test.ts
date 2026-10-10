// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import {
  history,
  historyKeymap,
  defaultKeymap,
  undo,
  cursorCharRight,
  cursorCharLeft,
} from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { acceptCompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';
import {
  relationshipDirectives,
  setDirectiveContext,
  setExternalSetConflicts,
  directiveBorderClass,
  directiveGuardBypass,
  insertDirective,
  type RelationshipDirectivesConfig,
} from '../directives';
import {
  relationshipDirectiveCompletions,
  type RelationshipCompletionOptions,
} from '../directive-completions';
import { isEditorPopupOpen } from '../../../shared/markdown-editor/extensions/editor-completions';
import { wikiLinks, setEntityLabels } from '../../../shared/markdown-editor/extensions/wiki-links';
import { serialiseTemplate } from '../../../../shared/relationships/directives/index';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
} from '../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
const GAINS_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'gains')!.template;
const LOSES_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'loses')!.template;

const FULL_CHANGE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});
const EMPTY_CHANGE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE);
const UNKNOWN_TRACK = serialiseTemplate('rp99', 'change', CHANGE_TEMPLATE, { amount: '1' });
const UNKNOWN_OPTION = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, {
  holder: '[[a1b2]]',
  option: 'boss',
  observer: '[[c3d4]]',
});
const EMPTY_GAINS = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE);
const LOSES_WITH_HOLDER = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
  holder: '[[c3d4]]',
});

const LABELS = new Map([
  ['a1b2', 'White Tigers'],
  ['c3d4', 'The Party'],
  ['e5f6', 'Spire Watch'],
]);

const NOTES = [
  { id: 'a1b2', path: 'a1b2.md', label: 'White Tigers' },
  { id: 'c3d4', path: 'c3d4.md', label: 'The Party' },
  { id: 'e5f6', path: 'e5f6.md', label: 'Spire Watch' },
];

interface Options {
  config?: RelationshipDirectivesConfig;
  choices?: Partial<RelationshipCompletionOptions>;
  readOnly?: boolean;
  defaultReason?: string;
  cursor?: number;
}

const views: EditorView[] = [];

function makeView(doc: string, options: Options = {}): EditorView {
  const config = options.config ?? { place: 'event' };
  const readOnly = options.readOnly ?? false;
  const choices: RelationshipCompletionOptions = {
    noteOptions: () => NOTES,
    ...options.choices,
  };
  const extensions = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    wikiLinks({ suggest: async () => [] }),
    relationshipDirectives({ ...config, readOnly }),
    ...(readOnly
      ? [EditorState.readOnly.of(true)]
      : [relationshipDirectiveCompletions(() => choices)]),
  ];
  const state = EditorState.create({
    doc,
    extensions,
    selection: EditorSelection.cursor(options.cursor ?? 0),
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({
    effects: [
      setDirectiveContext.of({
        library: { custom: [], optionAdditions: {} },
        defaultReason: options.defaultReason ?? 'Unspecified',
      }),
      setEntityLabels.of(LABELS),
    ],
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
  vi.restoreAllMocks();
});

const doc = (view: EditorView) => view.state.doc.toString();
const head = (view: EditorView) => view.state.selection.main.head;
const text = (view: EditorView) => view.contentDOM.textContent ?? '';

/** Where `{role:` ends (the value's start) in the document. */
function valueStart(view: EditorView, role: string, nth = 0): number {
  let from = -1;
  for (let i = 0; i <= nth; i++) from = doc(view).indexOf(`{${role}:`, from + 1);
  if (from === -1) throw new Error(`no ${role} token`);
  return from + role.length + 2;
}

function valueEnd(view: EditorView, role: string, nth = 0): number {
  return doc(view).indexOf('}', valueStart(view, role, nth));
}

function caretAt(view: EditorView, pos: number): void {
  view.dispatch({ selection: EditorSelection.cursor(pos) });
}

/** Types as the browser's input handling does: a replace-selection transaction tagged `input.type`. */
function type(view: EditorView, inserted: string): void {
  view.dispatch({ ...view.state.replaceSelection(inserted), userEvent: 'input.type' });
}

function userChange(view: EditorView, spec: TransactionSpec, userEvent: string): void {
  view.dispatch({ ...spec, userEvent });
}

function press(
  view: EditorView,
  key: string,
  mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean } = {},
): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
  return runScopeHandlers(view, event, 'editor');
}

/** A real keydown on the content, as the browser sends it (runs DOM handlers and keymaps). */
function keydown(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

/** Waits out autocompletion's interaction delay, during which it ignores accepting. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

async function openList(view: EditorView): Promise<string[]> {
  await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'));
  return currentCompletions(view.state).map((c) => c.label);
}

interface Row {
  label: string;
  section: string | null;
}

/** The open list's rows in display order, with the section each belongs to. */
async function openRows(view: EditorView): Promise<Row[]> {
  await openList(view);
  return currentCompletions(view.state).map((c) => ({
    label: c.label,
    section: typeof c.section === 'object' ? c.section.name : (c.section ?? null),
  }));
}

/** Tabs into the `role` blank from the one before it, which opens its list. */
function tabInto(view: EditorView, role: string): void {
  caretAt(view, valueStart(view, role));
  press(view, 'Tab', { shiftKey: true });
  press(view, 'Tab');
  expect(head(view)).toBe(valueStart(view, role));
}

const USED = 'Used on this track';
const UNUSED = 'Not used on this track';
const DAY = 86400;
const PARTY = 'c3d4';
const SPIRE = 'e5f6';
const TIGERS = 'a1b2';

const usageOf = (entries: Array<[string, number | null]>) => async () =>
  new Map<string, number | null>(entries);

describe('rendering', () => {
  it('shows the chip, wording and values, never the envelope, delimiters or ids', () => {
    const view = makeView(FULL_CHANGE);
    const shown = text(view);
    expect(shown).toContain('PF2E Reputation · Change');
    expect(shown).toContain('Rep change:');
    expect(shown).toContain('-2');
    expect(shown).toContain('White Tigers');
    expect(shown).toContain('The Party');
    expect(shown).toContain('attacked their warehouse');
    expect(shown).not.toContain('{{');
    expect(shown).not.toContain('rp01');
    expect(shown).not.toContain('{amount:');
    expect(shown).not.toContain('a1b2');
  });

  it('keeps the document untouched — rendering is decoration only', () => {
    const view = makeView(FULL_CHANGE);
    expect(doc(view)).toBe(FULL_CHANGE);
  });

  it('shows prompts for empty blanks and marks the directive unfinished', () => {
    const view = makeView(EMPTY_CHANGE);
    const prompts = [...view.dom.querySelectorAll('.cm-directive-placeholder-attention')].map(
      (e) => e.textContent,
    );
    expect(prompts).toEqual(['Reputation change', 'choose observer', 'choose holder']);
    expect(view.dom.querySelector('.cm-directive-unfinished')).not.toBeNull();
    expect(view.dom.querySelector('.cm-directive-chip-unfinished')).not.toBeNull();
  });

  it("shows the host's default reason in an empty reason blank", () => {
    const view = makeView(EMPTY_CHANGE, { defaultReason: 'The Vanguard falls out' });
    expect(view.dom.querySelector('.cm-directive-placeholder-default')?.textContent).toBe(
      'The Vanguard falls out',
    );
  });

  it('shows an unknown track as its raw text, flagged, so it can be fixed', () => {
    const view = makeView(UNKNOWN_TRACK);
    const raw = view.dom.querySelector<HTMLElement>('.cm-directive-raw');
    expect(raw?.textContent).toContain('{{rp99.change');
    expect(raw?.title).toMatch(/rp99/);
  });

  it('marks a bad value with its problem, leaving the rest readable', () => {
    const view = makeView(UNKNOWN_OPTION);
    const bad = view.dom.querySelector<HTMLElement>('.cm-directive-value-error');
    expect(bad?.textContent).toBe('boss');
    expect(bad?.title).toMatch(/boss/);
    expect(view.dom.querySelector('.cm-directive-error')).not.toBeNull();
  });

  it('flags a bad value straight away, even while other blanks are still empty', () => {
    const view = makeView(
      serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, { holder: '[[a1b2]]', option: 'marired' }),
    );
    const bad = view.dom.querySelector<HTMLElement>('.cm-directive-value-error');
    expect(bad?.textContent).toBe('marired');
    expect(bad?.title).toMatch(/marired/);
    expect(view.dom.querySelector('.cm-directive-chip-error')).not.toBeNull();
    expect(view.dom.querySelector('.cm-directive-placeholder-attention')?.textContent).toBe(
      'choose observer',
    );
  });

  it('maps statuses to outline classes', () => {
    expect(directiveBorderClass('unfinished')).toBe('cm-directive-unfinished');
    expect(directiveBorderClass('invalid')).toBe('cm-directive-error');
    expect(directiveBorderClass('ok')).toBeNull();
  });

  it('never draws wiki-link widgets for links inside a directive', () => {
    const view = makeView(FULL_CHANGE);
    expect(view.dom.querySelector('.cm-note-link')).toBeNull();
  });

  it('read-only: renders without the delete cross', () => {
    const view = makeView(FULL_CHANGE, { readOnly: true });
    expect(text(view)).toContain('White Tigers');
    expect(view.dom.querySelector('.cm-directive-cross')).toBeNull();
  });
});

describe('editing is typing into the document', () => {
  it('typing in an empty blank writes into its value', () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'amount'));
    type(view, '-3');
    expect(doc(view)).toContain('{amount:-3}');
    expect(head(view)).toBe(valueStart(view, 'amount') + 2);
  });

  it('typing at either edge of a filled free-text value extends it', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'reason'));
    type(view, '!');
    caretAt(view, valueStart(view, 'reason'));
    type(view, 'They ');
    expect(doc(view)).toContain('{reason:They attacked their warehouse!}');
  });

  it('drops a keystroke that would land in structure', () => {
    const view = makeView(FULL_CHANGE);
    for (const pos of [
      3,
      FULL_CHANGE.indexOf('Rep change') + 2,
      FULL_CHANGE.indexOf('{holder:') + 2,
    ]) {
      caretAt(view, pos);
      type(view, 'x');
      expect(doc(view)).toBe(FULL_CHANGE);
    }
  });

  it('drops a deletion that spans structure, but allows one inside a value', () => {
    const view = makeView(FULL_CHANGE);
    const wordingStart = FULL_CHANGE.indexOf(' rep for ');
    userChange(view, { changes: { from: wordingStart, to: wordingStart + 5 } }, 'delete.backward');
    expect(doc(view)).toBe(FULL_CHANGE);

    const reason = valueStart(view, 'reason');
    userChange(view, { changes: { from: reason, to: reason + 9 } }, 'delete.backward');
    expect(doc(view)).toContain('{reason:their warehouse}');
  });

  it('typing over a picked note replaces the whole link with the typed query', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'holder'));
    type(view, 'sp');
    expect(doc(view)).toContain('{holder:sp}');
    expect(head(view)).toBe(valueStart(view, 'holder') + 2);
  });

  it('strips braces and line breaks from pasted text', () => {
    const view = makeView(FULL_CHANGE);
    const from = valueStart(view, 'reason');
    userChange(
      view,
      { changes: { from, to: valueEnd(view, 'reason'), insert: 'a{b}\nc' } },
      'input.paste',
    );
    expect(doc(view)).toContain('{reason:ab c}');
  });

  it('text before and after a directive, and replacing it whole, are free', () => {
    const view = makeView(`x ${FULL_CHANGE} y`);
    caretAt(view, 2);
    type(view, 'A');
    caretAt(view, 3 + FULL_CHANGE.length);
    type(view, 'B');
    expect(doc(view)).toBe(`x A${FULL_CHANGE}B y`);
    userChange(
      view,
      { changes: { from: 3, to: 3 + FULL_CHANGE.length, insert: 'gone' } },
      'input.type',
    );
    expect(doc(view)).toBe('x AgoneB y');
  });

  it('guards every change, labelled or not — e.g. an image paste over half a directive', () => {
    const view = makeView(`intro ${FULL_CHANGE}`);
    view.dispatch({
      changes: { from: 2, to: 12, insert: '![map](notes-asset://current/map.png)' },
    });
    expect(doc(view)).toBe(`intro ${FULL_CHANGE}`);
  });

  it('flashes the directive a refused edit would have broken, then clears it', async () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, 3);
    type(view, 'x');
    expect(view.dom.querySelector('.cm-directive-blocked')).not.toBeNull();
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-directive-blocked')).toBeNull());
  });

  it('whole-buffer reloads pass, and the host bypass lets anything through', () => {
    const view = makeView(FULL_CHANGE);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: EMPTY_CHANGE } });
    expect(doc(view)).toBe(EMPTY_CHANGE);
    view.dispatch({
      changes: { from: 0, to: 2, insert: '[[' },
      annotations: directiveGuardBypass.of(true),
    });
    expect(doc(view).startsWith('[[rp01')).toBe(true);
  });

  it('undo steps back through edits normally', () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'amount'));
    type(view, '5');
    expect(doc(view)).toContain('{amount:5}');
    undo(view);
    expect(doc(view)).toBe(EMPTY_CHANGE);
  });

  it('Alt-↑/↓ steps an amount by the track step', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'amount'));
    expect(press(view, 'ArrowUp', { altKey: true })).toBe(true);
    expect(doc(view)).toContain('{amount:-1}');
    press(view, 'ArrowDown', { altKey: true });
    press(view, 'ArrowDown', { altKey: true });
    expect(doc(view)).toContain('{amount:-3}');
  });

  it('Mod-/ has no directive binding: the raw source is never shown', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'reason'));
    expect(press(view, '/', { ctrlKey: true })).toBe(false);
    expect(text(view)).not.toContain('{{rp01.change');
  });
});

describe('review round 2', () => {
  it('Backspace after a picked note clears the whole value, not the link brackets', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'observer'));
    expect(press(view, 'Backspace')).toBe(true);
    expect(doc(view)).toContain('{observer:}');
    expect(head(view)).toBe(valueStart(view, 'observer'));
  });

  it('Delete before a picked note clears it too', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueStart(view, 'holder'));
    expect(press(view, 'Delete')).toBe(true);
    expect(doc(view)).toContain('{holder:}');
  });

  it('Tab into a blank selects its whole value, so typing replaces it', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'holder'));
    press(view, 'Tab');
    const sel = view.state.selection.main;
    expect([sel.from, sel.to]).toEqual([valueStart(view, 'reason'), valueEnd(view, 'reason')]);
    type(view, 'new reason');
    expect(doc(view)).toContain('{reason:new reason}');
  });

  it('a number blank refuses letters but takes digits and a sign', () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'amount'));
    type(view, 'a');
    expect(doc(view)).toBe(EMPTY_CHANGE);
    expect(view.dom.querySelector('.cm-directive-blocked')).not.toBeNull();
    type(view, '-');
    type(view, '3');
    type(view, '.');
    expect(doc(view)).toContain('{amount:-3}');
    userChange(
      view,
      {
        changes: { from: valueStart(view, 'amount'), to: valueEnd(view, 'amount'), insert: '12x' },
      },
      'input.paste',
    );
    expect(doc(view)).toContain('{amount:-3}');
  });

  it('tag actions read Add and Remove (their stored keys are unchanged)', () => {
    const view = makeView(`${EMPTY_GAINS}\n${LOSES_WITH_HOLDER}`);
    expect(text(view)).toContain('Relationship tags · Add');
    expect(text(view)).toContain('Relationship tags · Remove');
    expect(doc(view)).toContain('{{tg01.gains ');
  });
});

describe('moving between blanks', () => {
  it('Tab goes to the end of the next blank, Shift-Tab back, and past the last leaves the directive', () => {
    const view = makeView(`${FULL_CHANGE} tail`);
    caretAt(view, valueEnd(view, 'amount'));
    press(view, 'Tab');
    expect(head(view)).toBe(valueEnd(view, 'observer'));
    press(view, 'Tab');
    expect(head(view)).toBe(valueEnd(view, 'holder'));
    press(view, 'Tab', { shiftKey: true });
    expect(head(view)).toBe(valueEnd(view, 'observer'));
    press(view, 'Tab');
    press(view, 'Tab');
    expect(head(view)).toBe(valueEnd(view, 'reason'));
    press(view, 'Tab');
    expect(head(view)).toBe(FULL_CHANGE.length);
  });

  it('Home/End go to the blank edges first, then fall through to the line', () => {
    const view = makeView(`${FULL_CHANGE} tail`);
    caretAt(view, valueStart(view, 'reason') + 4);
    expect(press(view, 'End')).toBe(true);
    expect(head(view)).toBe(valueEnd(view, 'reason'));
    expect(press(view, 'Home')).toBe(true);
    expect(head(view)).toBe(valueStart(view, 'reason'));
    caretAt(view, valueEnd(view, 'reason'));
    press(view, 'End');
    expect(head(view)).toBe(doc(view).length);
  });

  it('Tab outside a directive is left to the editor', () => {
    const view = makeView(`${FULL_CHANGE} tail`);
    caretAt(view, doc(view).length);
    expect(press(view, 'Tab')).toBe(false);
  });

  it('arrow keys hop over wording and delimiters from one blank edge to the next', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueEnd(view, 'amount'));
    cursorCharRight(view);
    expect(head(view)).toBe(valueStart(view, 'observer'));
    cursorCharLeft(view);
    expect(head(view)).toBe(valueEnd(view, 'amount'));
  });

  it('a picked note is one unit to the arrow keys', () => {
    const view = makeView(FULL_CHANGE);
    caretAt(view, valueStart(view, 'observer'));
    cursorCharRight(view);
    expect(head(view)).toBe(valueEnd(view, 'observer'));
  });

  it('Backspace after a directive selects it, again deletes it; undo restores it', () => {
    const view = makeView(`${FULL_CHANGE}\nafter`);
    caretAt(view, FULL_CHANGE.length);
    press(view, 'Backspace');
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(FULL_CHANGE.length);
    press(view, 'Backspace');
    expect(doc(view)).toBe('\nafter');
    undo(view);
    expect(doc(view)).toBe(`${FULL_CHANGE}\nafter`);
  });
});

describe('choices', () => {
  it('Tab into a note blank opens every note A-Z when the track has no usage', async () => {
    const view = makeView(EMPTY_CHANGE);
    tabInto(view, 'observer');
    expect(await openRows(view)).toEqual([
      { label: 'Spire Watch', section: UNUSED },
      { label: 'The Party', section: UNUSED },
      { label: 'White Tigers', section: UNUSED },
    ]);
    expect(isEditorPopupOpen(view.contentDOM)).toBe(true);
  });

  it('picking a note writes its link and moves on to the next blank', async () => {
    const view = makeView(EMPTY_CHANGE);
    tabInto(view, 'observer');
    await openList(view);
    await settle();
    expect(acceptCompletion(view)).toBe(true);
    expect(doc(view)).toContain('{observer:[[e5f6]]}');
    expect(head(view)).toBe(valueEnd(view, 'holder'));
    // The next blank's list reopens by itself.
    expect(await openList(view)).toContain('The Party');
  });

  it('shows used notes above unused notes', async () => {
    const trackUsage = usageOf([[SPIRE, DAY]]);
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    expect(await openRows(view)).toEqual([
      { label: 'Spire Watch', section: USED },
      { label: 'The Party', section: UNUSED },
      { label: 'White Tigers', section: UNUSED },
    ]);
  });

  it('hides the used section when the track has no usage', async () => {
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage: usageOf([]) } });
    tabInto(view, 'holder');
    const rows = await openRows(view);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.section))).toEqual(new Set([UNUSED]));
  });

  it('hides the unused section when every note is used', async () => {
    const trackUsage = usageOf([
      [SPIRE, DAY],
      [PARTY, 2 * DAY],
      [TIGERS, null],
    ]);
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    const rows = await openRows(view);
    expect(rows.map((r) => r.label)).toEqual(['Spire Watch', 'The Party', 'White Tigers']);
    expect(new Set(rows.map((r) => r.section))).toEqual(new Set([USED]));
  });

  it('ties on equal proximity fall back to A-Z', async () => {
    const trackUsage = usageOf([
      [TIGERS, DAY],
      [PARTY, DAY],
      [SPIRE, 9 * DAY],
    ]);
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    expect((await openRows(view)).map((r) => r.label)).toEqual([
      'The Party',
      'White Tigers',
      'Spire Watch',
    ]);
  });

  it('a different event date reorders the used section', async () => {
    let at: 'early' | 'late' = 'early';
    const trackUsage = vi.fn(async () =>
      at === 'early'
        ? new Map([
            [PARTY, DAY],
            [SPIRE, 5 * DAY],
          ])
        : new Map([
            [PARTY, 5 * DAY],
            [SPIRE, DAY],
          ]),
    );
    const first = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(first, 'observer');
    expect((await openRows(first)).map((r) => r.label)).toEqual([
      'The Party',
      'Spire Watch',
      'White Tigers',
    ]);
    at = 'late';
    const second = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(second, 'observer');
    expect((await openRows(second)).map((r) => r.label)).toEqual([
      'Spire Watch',
      'The Party',
      'White Tigers',
    ]);
  });

  it('dateless used notes sort after dated ones', async () => {
    const trackUsage = usageOf([
      [PARTY, null],
      [TIGERS, 400 * DAY],
    ]);
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    expect(await openRows(view)).toEqual([
      { label: 'White Tigers', section: USED },
      { label: 'The Party', section: USED },
      { label: 'Spire Watch', section: UNUSED },
    ]);
  });

  it('unused notes are A-Z regardless of input order', async () => {
    const shuffled = [NOTES[1], NOTES[0], NOTES[2]];
    const view = makeView(EMPTY_CHANGE, { choices: { noteOptions: () => shuffled } });
    tabInto(view, 'observer');
    expect((await openRows(view)).map((r) => r.label)).toEqual([
      'Spire Watch',
      'The Party',
      'White Tigers',
    ]);
  });

  it('typing filters within sections and drops empty sections', async () => {
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage: usageOf([[SPIRE, DAY]]) } });
    caretAt(view, valueStart(view, 'observer'));
    type(view, 'white');
    expect(await openRows(view)).toEqual([{ label: 'White Tigers', section: UNUSED }]);
  });

  it('default holder is pinned first on an empty query without a section and not repeated', async () => {
    const view = makeView(EMPTY_CHANGE, {
      choices: { defaultHolderId: () => PARTY, trackUsage: usageOf([[SPIRE, DAY]]) },
    });
    tabInto(view, 'holder');
    expect(await openRows(view)).toEqual([
      { label: 'The Party', section: null },
      { label: 'Spire Watch', section: USED },
      { label: 'White Tigers', section: UNUSED },
    ]);
    expect(currentCompletions(view.state)[0].detail).toBe('default holder');
  });

  it('default holder is not pinned while typing', async () => {
    const view = makeView(EMPTY_CHANGE, {
      choices: { defaultHolderId: () => PARTY, trackUsage: usageOf([[PARTY, DAY]]) },
    });
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'part');
    expect(await openRows(view)).toEqual([{ label: 'The Party', section: USED }]);
  });

  it('observer blank never pins the default holder', async () => {
    const view = makeView(EMPTY_CHANGE, { choices: { defaultHolderId: () => PARTY } });
    tabInto(view, 'observer');
    expect((await openRows(view)).map((r) => r.label)).toEqual([
      'Spire Watch',
      'The Party',
      'White Tigers',
    ]);
  });

  it('the open note is no longer pinned, only badged', async () => {
    const view = makeView(EMPTY_CHANGE, { choices: { currentNoteId: () => TIGERS } });
    tabInto(view, 'observer');
    await openList(view);
    const rows = currentCompletions(view.state);
    expect(rows.map((c) => c.label)).toEqual(['Spire Watch', 'The Party', 'White Tigers']);
    expect(rows[2].detail).toBe('this note');
  });

  it('Remove narrowing is sectioned', async () => {
    const heldTags = vi.fn(
      async () =>
        new Map([
          [SPIRE, ['married']],
          [TIGERS, ['married']],
        ]),
    );
    const doc0 = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: 'married',
    });
    const view = makeView(doc0, {
      choices: { heldTags, trackUsage: usageOf([[TIGERS, DAY]]) },
    });
    caretAt(view, valueEnd(view, 'option'));
    press(view, 'Tab');
    expect(await openRows(view)).toEqual([
      { label: 'White Tigers', section: USED },
      { label: 'Spire Watch', section: UNUSED },
    ]);
  });

  describe('Tab / Enter on an empty blank', () => {
    const pinnedChoices = () => ({
      defaultHolderId: () => PARTY,
      trackUsage: usageOf([[SPIRE, DAY]]),
    });

    it.each(['Tab', 'Enter'])(
      '%s picks the pinned default holder with the list open',
      async (key) => {
        const view = makeView(EMPTY_CHANGE, { choices: pinnedChoices() });
        tabInto(view, 'holder');
        await openList(view);
        await settle();
        expect(press(view, key)).toBe(true);
        expect(doc(view)).toContain('{holder:[[c3d4]]}');
      },
    );

    it.each(['Tab', 'Enter'])(
      '%s picks the pinned default holder with the list closed',
      async (key) => {
        const view = makeView(EMPTY_CHANGE, { choices: pinnedChoices() });
        tabInto(view, 'holder');
        await openList(view);
        press(view, 'Escape');
        expect(completionStatus(view.state)).not.toBe('active');
        press(view, key);
        await vi.waitFor(() => expect(doc(view)).toContain('{holder:[[c3d4]]}'));
      },
    );

    it('Tab leaves a holder that already holds a note and moves on', async () => {
      const view = makeView(FULL_CHANGE, { choices: pinnedChoices() });
      caretAt(view, valueEnd(view, 'holder'));
      press(view, 'Tab');
      await settle();
      expect(doc(view)).toBe(FULL_CHANGE);
      expect(head(view)).toBeGreaterThan(valueEnd(view, 'holder'));
    });

    it('Tab leaves an empty observer blank and moves on', async () => {
      const view = makeView(EMPTY_CHANGE, { choices: pinnedChoices() });
      tabInto(view, 'observer');
      await openList(view);
      press(view, 'Escape');
      press(view, 'Tab');
      await settle();
      expect(doc(view)).toBe(EMPTY_CHANGE);
      expect(head(view)).toBe(valueStart(view, 'holder'));
    });

    it('Tab leaves an empty holder blank with no default holder and moves on', async () => {
      const view = makeView(EMPTY_CHANGE);
      tabInto(view, 'holder');
      await openList(view);
      press(view, 'Escape');
      press(view, 'Tab');
      await settle();
      expect(doc(view)).toBe(EMPTY_CHANGE);
      expect(head(view)).toBeGreaterThan(valueStart(view, 'holder'));
    });

    it('Tab on a typed query with no match moves on', async () => {
      const view = makeView(EMPTY_CHANGE, { choices: pinnedChoices() });
      caretAt(view, valueStart(view, 'holder'));
      type(view, 'zzz');
      press(view, 'Tab');
      await settle();
      expect(doc(view)).toContain('{holder:zzz}');
      expect(head(view)).toBeGreaterThan(valueEnd(view, 'holder'));
    });

    it('Shift-Tab still goes to the previous blank', async () => {
      const view = makeView(EMPTY_CHANGE, { choices: pinnedChoices() });
      tabInto(view, 'holder');
      press(view, 'Tab', { shiftKey: true });
      await settle();
      expect(doc(view)).toBe(EMPTY_CHANGE);
      expect(head(view)).toBe(valueStart(view, 'observer'));
    });
  });

  it('Tab on a typed query picks the first shown row, before and after the list opens', async () => {
    // "t" matches The Party best by text, but the used Spire Watch is shown first.
    const choices = { trackUsage: usageOf([[SPIRE, DAY]]) };
    const open = makeView(EMPTY_CHANGE, { choices });
    caretAt(open, valueStart(open, 'holder'));
    type(open, 't');
    expect((await openRows(open))[0].label).toBe('Spire Watch');
    await settle();
    press(open, 'Tab');
    await vi.waitFor(() => expect(doc(open)).toContain('{holder:[[e5f6]]}'));

    const early = makeView(EMPTY_CHANGE, { choices });
    caretAt(early, valueStart(early, 'holder'));
    type(early, 't');
    expect(completionStatus(early.state)).not.toBe('active');
    press(early, 'Tab');
    await vi.waitFor(() => expect(doc(early)).toContain('{holder:[[e5f6]]}'));
  });

  it('the 50-row cap keeps used notes before unused', async () => {
    const many = Array.from({ length: 60 }, (_, i) => {
      const id = `n${String(i).padStart(2, '0')}`;
      return { id, path: `${id}.md`, label: `Note ${String(i).padStart(2, '0')}` };
    });
    const usedIds = ['n57', 'n58', 'n59'];
    const view = makeView(EMPTY_CHANGE, {
      choices: {
        noteOptions: () => many,
        trackUsage: usageOf(usedIds.map((id) => [id, DAY] as [string, number])),
      },
    });
    tabInto(view, 'observer');
    const rows = await openRows(view);
    expect(rows).toHaveLength(50);
    expect(rows.slice(0, 3).map((r) => r.label)).toEqual(['Note 57', 'Note 58', 'Note 59']);
    expect(rows.filter((r) => r.section === USED)).toHaveLength(3);
    expect(rows[3]).toEqual({ label: 'Note 00', section: UNUSED });
  });

  it('a rejected trackUsage lookup lists every note as not used', async () => {
    const trackUsage = () => Promise.reject(new Error('io'));
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    expect(await openRows(view)).toEqual([
      { label: 'Spire Watch', section: UNUSED },
      { label: 'The Party', section: UNUSED },
      { label: 'White Tigers', section: UNUSED },
    ]);
  });

  it('trackUsage is called once per document and directive and re-queried after an edit', async () => {
    const trackUsage = vi.fn(async () => new Map<string, number | null>());
    const view = makeView(EMPTY_CHANGE, { choices: { trackUsage } });
    tabInto(view, 'observer');
    await openList(view);
    press(view, 'Tab');
    await openList(view);
    expect(trackUsage).toHaveBeenCalledTimes(1);
    expect(trackUsage).toHaveBeenCalledWith({ trackId: 'rp01', anchor: 0, doc: EMPTY_CHANGE });

    view.dispatch({ changes: { from: 0, insert: ' ' } });
    tabInto(view, 'observer');
    await vi.waitFor(() => expect(trackUsage).toHaveBeenCalledTimes(2));
    expect(trackUsage).toHaveBeenLastCalledWith({
      trackId: 'rp01',
      anchor: 1,
      doc: ` ${EMPTY_CHANGE}`,
    });
  });

  it('make-default row follows its note within the same section', async () => {
    const view = makeView(EMPTY_CHANGE, {
      choices: { setDefaultHolder: vi.fn(), trackUsage: usageOf([[SPIRE, DAY]]) },
    });
    tabInto(view, 'holder');
    expect(await openRows(view)).toEqual([
      { label: 'Spire Watch', section: USED },
      { label: 'Use Spire Watch and make it the default holder', section: USED },
      { label: 'The Party', section: UNUSED },
      { label: 'Use The Party and make it the default holder', section: UNUSED },
      { label: 'White Tigers', section: UNUSED },
      { label: 'Use White Tigers and make it the default holder', section: UNUSED },
    ]);
  });

  it('the typed text is the query, and Tab takes the top match', async () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'spi');
    expect(await openList(view)).toEqual(['Spire Watch']);
    press(view, 'Tab');
    await vi.waitFor(() => expect(doc(view)).toContain('{holder:[[e5f6]]}'));
    expect(head(view)).toBe(valueEnd(view, 'reason'));
  });

  it('Tab straight after typing, before any list has opened, still takes the top match', async () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'white');
    expect(completionStatus(view.state)).not.toBe('active');
    press(view, 'Tab');
    await vi.waitFor(() => expect(doc(view)).toContain('{holder:[[a1b2]]}'));
  });

  it('with no default holder set, the holder blank offers an extra "make it the default" row alongside the normal pick', async () => {
    const view = makeView(EMPTY_CHANGE, { choices: { setDefaultHolder: vi.fn() } });
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'party');
    expect(await openList(view)).toEqual([
      'The Party',
      'Use The Party and make it the default holder',
    ]);
  });

  it('a default holder already set: no extra row, just the normal pick', async () => {
    const view = makeView(EMPTY_CHANGE, {
      choices: { setDefaultHolder: vi.fn(), defaultHolderId: () => 'c3d4' },
    });
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'party');
    expect(await openList(view)).toEqual(['The Party']);
  });

  it('picking the normal row inserts the note without setting a default holder', async () => {
    const setDefaultHolder = vi.fn();
    const view = makeView(EMPTY_CHANGE, { choices: { setDefaultHolder } });
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'party');
    press(view, 'Tab');
    await vi.waitFor(() => expect(doc(view)).toContain('{holder:[[c3d4]]}'));
    expect(setDefaultHolder).not.toHaveBeenCalled();
  });

  it('picking "…and make it the default holder" inserts the note AND sets it as the default holder — no dialog, no focus loss', async () => {
    const setDefaultHolder = vi.fn();
    const view = makeView(EMPTY_CHANGE, { choices: { setDefaultHolder } });
    caretAt(view, valueStart(view, 'holder'));
    type(view, 'party');
    await openList(view);
    await settle();
    keydown(view, 'ArrowDown'); // move highlight onto the "make it default" row
    press(view, 'Enter');
    await vi.waitFor(() => expect(doc(view)).toContain('{holder:[[c3d4]]}'));
    expect(setDefaultHolder).toHaveBeenCalledWith('c3d4');
    expect(isEditorPopupOpen(view.contentDOM)).toBe(false);
  });

  it('a tag blank lists the track tags; an Add blank offers to create an unknown one', async () => {
    const createOption = vi.fn(async () => ({ key: 'rival' }));
    const view = makeView(EMPTY_GAINS, { choices: { createOption } });
    caretAt(view, valueStart(view, 'option'));
    type(view, 'riv');
    expect(await openList(view)).toEqual(['Create "riv"', 'Create "riv" (symmetrical)']);
    await settle();
    // Creating is permanent, so it takes an explicit pick: move onto the row first.
    keydown(view, 'ArrowDown');
    keydown(view, 'ArrowUp');
    press(view, 'Enter');
    await vi.waitFor(() => expect(doc(view)).toContain('{option:rival}'));
    expect(createOption).toHaveBeenCalledWith('tg01', 'riv', false);
  });

  it('Tab or Enter on a typo in an Add tag never creates it; it moves on and leaves the text', async () => {
    const createOption = vi.fn(async () => ({ key: 'marired' }));
    const view = makeView(EMPTY_GAINS, { choices: { createOption } });
    caretAt(view, valueStart(view, 'option'));
    type(view, 'marired');
    expect(await openList(view)).toEqual(['Create "marired"', 'Create "marired" (symmetrical)']);
    await settle();
    press(view, 'Tab');
    expect(head(view)).toBe(valueEnd(view, 'observer'));
    press(view, 'Tab', { shiftKey: true });
    press(view, 'Enter');
    await settle();
    expect(createOption).not.toHaveBeenCalled();
    expect(doc(view)).toContain('{option:marired}');
  });

  it('a note query that matches nothing lets Tab move on instead of swallowing it', () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'observer'));
    type(view, 'zzz');
    expect(press(view, 'Tab')).toBe(true);
    expect(head(view)).toBe(valueEnd(view, 'holder'));
    expect(doc(view)).toContain('{observer:zzz}');
  });

  it('a created tag lands in its own blank even if the document moved meanwhile', async () => {
    let finish: (v: { key: string }) => void = () => {};
    const createOption = vi.fn(() => new Promise<{ key: string }>((r) => (finish = r)));
    const view = makeView(`\n${EMPTY_GAINS}`, { choices: { createOption } });
    caretAt(view, valueStart(view, 'option'));
    type(view, 'rival');
    await openList(view);
    await settle();
    keydown(view, 'ArrowDown');
    keydown(view, 'ArrowUp');
    press(view, 'Enter');
    expect(createOption).toHaveBeenCalled();
    // Another directive appears above while the host is still creating the tag.
    view.dispatch({ changes: { from: 0, insert: EMPTY_GAINS } });
    finish({ key: 'rival' });
    await vi.waitFor(() => expect(doc(view)).toContain('{option:rival}'));
    expect(doc(view).indexOf('{option:rival}')).toBeGreaterThan(EMPTY_GAINS.length);
    expect(doc(view).startsWith(EMPTY_GAINS)).toBe(true);
  });

  it('a Remove tag blank lists only held tags and never offers create', async () => {
    const heldTags = vi.fn(async () => new Map([['e5f6', ['married']]]));
    const view = makeView(LOSES_WITH_HOLDER, {
      choices: { heldTags, createOption: vi.fn() },
    });
    caretAt(view, valueStart(view, 'option'));
    type(view, 'ma');
    expect(await openList(view)).toEqual(['married']);
    expect(heldTags).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'tg01', holder: 'c3d4', anchor: 0 }),
    );
  });

  it('a failed held-tag lookup shows every tag instead of hanging', async () => {
    const view = makeView(LOSES_WITH_HOLDER, {
      choices: { heldTags: () => Promise.reject(new Error('io')) },
    });
    caretAt(view, valueStart(view, 'option'));
    type(view, 'm');
    expect(await openList(view)).toEqual(['member', 'married', 'employee', 'customer']);
  });

  it("a Remove observer blank lists only notes sharing the holder's tag", async () => {
    const heldTags = vi.fn(async () => new Map([['e5f6', ['married']]]));
    const doc0 = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: 'married',
    });
    const view = makeView(doc0, { choices: { heldTags } });
    caretAt(view, valueEnd(view, 'option'));
    press(view, 'Tab');
    expect(await openList(view)).toEqual(['Spire Watch']);
    expect(heldTags).toHaveBeenCalledWith(expect.objectContaining({ holder: 'c3d4' }));
  });

  it('one heldTags lookup per holder is shared by the tag and observer blanks, and any edit starts fresh', async () => {
    const heldTags = vi.fn(async () => new Map([['e5f6', ['married']]]));
    const doc0 = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: 'married',
    });
    const view = makeView(doc0, { choices: { heldTags } });

    // Arriving on the (already filled) tag blank by Tab opens its list.
    caretAt(view, valueStart(view, 'holder'));
    press(view, 'Tab');
    await openList(view);
    // Tab again (the filled value isn't a typed query) lands on the empty
    // observer blank and opens its list too — sharing the same lookup.
    press(view, 'Tab');
    await openList(view);
    expect(heldTags).toHaveBeenCalledTimes(1);

    // An edit invalidates the per-document cache.
    view.dispatch({ changes: { from: 0, insert: ' ' } });
    caretAt(view, valueStart(view, 'holder') + 1);
    press(view, 'Tab');
    await settle();
    expect(heldTags.mock.calls.length).toBeGreaterThan(1);
  });

  it('free-text blanks (amount, reason) offer no list', async () => {
    const view = makeView(EMPTY_CHANGE);
    caretAt(view, valueStart(view, 'amount'));
    type(view, '2');
    await new Promise((r) => setTimeout(r, 150));
    expect(completionStatus(view.state)).toBeNull();
  });

  it('inserting a directive puts the caret in its first blank', () => {
    const view = makeView('before\nafter');
    insertDirective(view, 7, 7, EMPTY_CHANGE);
    expect(doc(view)).toBe(`before\n${EMPTY_CHANGE}after`);
    expect(head(view)).toBe(valueStart(view, 'amount'));
  });
});

describe('never nesting', () => {
  it('inserting inside a directive puts the new one right after it', () => {
    const view = makeView(FULL_CHANGE);
    const inside = valueStart(view, 'reason') + 3;
    insertDirective(view, inside, inside, EMPTY_CHANGE);
    expect(doc(view)).toBe(`${FULL_CHANGE} ${EMPTY_CHANGE}`);
    expect(head(view)).toBe(FULL_CHANGE.length + 1 + EMPTY_CHANGE.indexOf('{amount:') + 8);
  });
});

describe('pointer', () => {
  function mousedown(el: Element, mods: { ctrlKey?: boolean } = {}): MouseEvent {
    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...mods,
    });
    el.dispatchEvent(event);
    return event;
  }

  it('Ctrl-click on a note opens it', () => {
    const onOpenNote = vi.fn();
    const view = makeView(FULL_CHANGE, { config: { place: 'event', onOpenNote } });
    const note = [...view.dom.querySelectorAll('.cm-directive-value-note')].find(
      (e) => e.textContent === 'The Party',
    )!;
    const event = mousedown(note, { ctrlKey: true });
    expect(onOpenNote).toHaveBeenCalledWith('c3d4');
    expect(event.defaultPrevented).toBe(true);
  });

  it('a click on wording lands the caret in a blank', () => {
    const view = makeView(`${FULL_CHANGE}\nafter`, { cursor: doc0Length() });
    const wording = view.dom.querySelector('.cm-directive-wording')!;
    mousedown(wording);
    const pos = head(view);
    const slots = ['amount', 'observer', 'holder', 'reason'].flatMap((r) => [
      valueStart(view, r),
      valueEnd(view, r),
    ]);
    expect(slots).toContain(pos);
  });

  it('the cross deletes the whole directive in one undo step', () => {
    const view = makeView(`${FULL_CHANGE}\nafter`);
    mousedown(view.dom.querySelector('.cm-directive-cross')!);
    expect(doc(view)).toBe('\nafter');
    undo(view);
    expect(doc(view)).toBe(`${FULL_CHANGE}\nafter`);
  });
});

const SET_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'set')!.template;

function repSet(holder: string, observer: string, value: string): string {
  return serialiseTemplate('rp01', 'set', SET_TEMPLATE, {
    holder: `[[${holder}]]`,
    observer: `[[${observer}]]`,
    value,
    reason: 'gift',
  });
}

describe('undated Set conflicts', () => {
  it('flags two Sets in the same note for the same relationship, both with a message, and clears both when one is removed', () => {
    const first = repSet('c3d4', 'a1b2', '-10');
    const second = repSet('c3d4', 'a1b2', '-9');
    const view = makeView(`${first}\n${second}`, { config: { place: 'note' } });

    const flagged = [...view.dom.querySelectorAll('.cm-directive-error')];
    expect(flagged).toHaveLength(2);
    for (const el of flagged as HTMLElement[]) {
      expect(el.title).toMatch(/Only one note may set this relationship/);
      expect(el.title).toMatch(/set more than once in this note/);
    }

    // Delete the second directive — the first's flag clears.
    const secondFrom = view.state.doc.toString().indexOf(second);
    view.dispatch({
      changes: { from: secondFrom - 1, to: view.state.doc.length, insert: '' },
    });
    expect(view.dom.querySelector('.cm-directive-error')).toBeNull();
  });

  it('does not conflict when the holder/observer differ', () => {
    const view = makeView(`${repSet('c3d4', 'a1b2', '-10')}\n${repSet('c3d4', 'e5f6', '-9')}`, {
      config: { place: 'note' },
    });
    expect(view.dom.querySelector('.cm-directive-error')).toBeNull();
  });

  it('flags a note Set that conflicts with an undated Set pushed in from another saved file, naming it by title', () => {
    const view = makeView(repSet('c3d4', 'a1b2', '-10'), { config: { place: 'note' } });
    view.dispatch({
      effects: setExternalSetConflicts.of([
        {
          holder: 'c3d4',
          observer: 'a1b2',
          trackId: 'rp01',
          path: 'notes/other.md',
          title: 'The Party',
        },
      ]),
    });

    const flagged = view.dom.querySelector<HTMLElement>('.cm-directive-error');
    expect(flagged).not.toBeNull();
    expect(flagged?.title).toMatch(/Only one note may set this relationship/);
    expect(flagged?.title).toMatch(/also set in The Party/);
  });

  it('an event editor never flags an undated-Set conflict', () => {
    const view = makeView(`${repSet('c3d4', 'a1b2', '-10')}\n${repSet('c3d4', 'a1b2', '-9')}`, {
      config: { place: 'event' },
    });
    expect(view.dom.querySelector('.cm-directive-error')).toBeNull();
  });

  it('ignores an invalid directive — it never joins a conflict group', () => {
    const view = makeView(`${repSet('c3d4', 'a1b2', '-10')}\n${UNKNOWN_OPTION}`, {
      config: { place: 'note' },
    });
    const flagged = [...view.dom.querySelectorAll('.cm-directive-error')];
    // Only the unknown-option directive is invalid; the lone Set has no conflict.
    expect(flagged).toHaveLength(1);
    expect(flagged[0].title).not.toMatch(/Only one note may set this relationship/);
  });
});

function doc0Length(): number {
  return FULL_CHANGE.length + 6;
}
