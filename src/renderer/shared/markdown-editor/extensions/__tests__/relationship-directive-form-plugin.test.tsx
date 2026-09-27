// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { relationshipDirectives, setDirectiveContext } from '../relationship-directives';
import {
  relationshipDirectiveForm,
  insertDirective,
  directiveFormStateField,
  type RelationshipFormHostContext,
} from '../relationship-directive-form-plugin';
import { setEntityLabels } from '../wiki-links';
import { computeCaretPlacement } from '../../../context-menu/caret-position';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
} from '../../../../../shared/relationships/system/index';
import type { TrackLibrary } from '../../../../../shared/relationships';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
const GAINS_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'gains')!.template;
const LOSES_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'loses')!.template;

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

const LABELS = new Map([
  ['a1b2', 'White Tigers'],
  ['c3d4', 'The Party'],
]);

interface Setup {
  view: EditorView;
  container: HTMLDivElement;
}

/** Waits for the microtask + macrotask the form plugin uses to reposition/focus after opening. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function makeSetup(doc: string, ctx: Partial<RelationshipFormHostContext> = {}): Setup {
  const context: RelationshipFormHostContext = {
    library: LIBRARY,
    defaultReason: 'Unspecified',
    noteOptions: () => [],
    ...ctx,
  };
  const extensions = [
    history(),
    relationshipDirectives({ place: 'event' }),
    relationshipDirectiveForm(() => context),
  ];
  const state = EditorState.create({ doc, extensions });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let view!: EditorView;
  act(() => {
    view = new EditorView({ state, parent: container });
    view.dispatch({
      effects: [
        setDirectiveContext.of({ library: LIBRARY, defaultReason: 'Unspecified' }),
        setEntityLabels.of(LABELS),
      ],
    });
  });
  return { view, container };
}

let cleanup: Setup[] = [];
function track(setup: Setup): Setup {
  cleanup.push(setup);
  return setup;
}
afterEach(async () => {
  cleanup.forEach(({ view, container }) => {
    act(() => view.destroy());
    container.remove();
  });
  cleanup = [];
  // The form plugin's `unmount()` defers the React root's actual teardown
  // by a microtask — flush it so a stale form from this test never lingers
  // into the next one.
  await flush();
  vi.restoreAllMocks();
});

function formEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.relationship-directive-form');
  if (!el) throw new Error('form is not open');
  return el;
}

function formInputs(): HTMLInputElement[] {
  return Array.from(formEl().querySelectorAll('input'));
}

function pressEnterOnSelectedBlock(view: EditorView, from: number, to: number): void {
  act(() => {
    view.dispatch({ selection: { anchor: from, head: to } });
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  });
}

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
}

describe('relationship directive form — opening', () => {
  it('inserting a directive opens its form with the first empty field focused', async () => {
    const setup = track(makeSetup(''));
    const { view } = setup;
    const text = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'x',
    });

    act(() => insertDirective(view, 0, 0, text));
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
    await flush();

    expect(document.querySelector('.relationship-directive-form')).not.toBeNull();
    // amount is the first (and only) empty blank in this template.
    const inputs = formInputs();
    expect(inputs.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('Enter on a selected block opens the form', async () => {
    const original = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'x',
    });
    const setup = track(makeSetup(original));
    const { view } = setup;

    pressEnterOnSelectedBlock(view, 0, original.length);
    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
    await flush();
    expect(document.querySelector('.relationship-directive-form')).not.toBeNull();
  });
});

describe('relationship directive form — Save', () => {
  it('Save writes only the changed tokens, as one undo step', async () => {
    const original = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'attacked their warehouse',
    });
    const setup = track(makeSetup(original));
    const { view } = setup;

    pressEnterOnSelectedBlock(view, 0, original.length);
    await flush();

    // Change only the reason field's value.
    const reasonInput = formEl().querySelector<HTMLInputElement>(
      'input[placeholder="Unspecified"]',
    )!;
    typeInto(reasonInput, 'raided the warehouse');

    const saveButton = formEl().querySelector<HTMLButtonElement>(
      '.relationship-directive-form-save',
    )!;
    act(() => saveButton.click());
    await flush();

    const after = view.state.doc.toString();
    expect(after).toContain('raided the warehouse');
    expect(after).toContain('{amount:-2}');
    expect(after).toContain('{observer:[[a1b2]]}');
    expect(after).toContain('{holder:[[c3d4]]}');
    expect(view.state.field(directiveFormStateField)).toBeNull();

    act(() => undo(view));
    expect(view.state.doc.toString()).toBe(original);
  });

  it('an inline validation error on Save blocks the write and keeps the form open', async () => {
    const original = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'x',
    });
    const setup = track(makeSetup(original));
    const { view } = setup;
    pressEnterOnSelectedBlock(view, 0, original.length);
    await flush();

    const amountInput = formInputs()[0];
    typeInto(amountInput, '0');

    const saveButton = formEl().querySelector<HTMLButtonElement>(
      '.relationship-directive-form-save',
    )!;
    act(() => saveButton.click());
    await flush();

    expect(view.state.field(directiveFormStateField)).toEqual({ anchor: 0 });
    expect(view.state.doc.toString()).toBe(original);
    expect(formEl().textContent).toContain('cannot be zero');
  });
});

describe('relationship directive form — cancel', () => {
  it('Escape cancels without changing the doc and closes only the form', async () => {
    const original = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'x',
    });
    const setup = track(makeSetup(original));
    const { view } = setup;
    pressEnterOnSelectedBlock(view, 0, original.length);
    await flush();

    const amountInput = formInputs()[0];
    typeInto(amountInput, '-9');

    act(() => {
      formEl().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(view.state.field(directiveFormStateField)).toBeNull();
    expect(view.state.doc.toString()).toBe(original);
  });

  it('clicking outside cancels without changing the doc', async () => {
    const original = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
      holder: '[[c3d4]]',
      reason: 'x',
    });
    const setup = track(makeSetup(original));
    const { view } = setup;
    pressEnterOnSelectedBlock(view, 0, original.length);
    await flush();

    act(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flush();

    expect(view.state.field(directiveFormStateField)).toBeNull();
    expect(view.state.doc.toString()).toBe(original);
  });
});

describe('relationship directive form — Create row only on Add', () => {
  it('offers Create for an Add (gains) action', async () => {
    const createOption = vi.fn().mockResolvedValue({ key: 'boss' });
    const gains = serialiseTemplate('tg01', 'gains', GAINS_TEMPLATE, {
      holder: '[[c3d4]]',
      option: '',
      observer: '[[a1b2]]',
      reason: 'x',
    });
    const setup = track(makeSetup('', { createOption }));
    act(() => insertDirective(setup.view, 0, 0, gains));
    await flush();
    const optionInput = formInputs().find((el) => el.placeholder === 'Choose an option…')!;
    typeInto(optionInput, 'Boss');
    await flush();
    expect(formEl().textContent).toContain('Create "Boss"');
  });

  it('never offers Create for a Remove (loses) action', async () => {
    const createOption = vi.fn().mockResolvedValue({ key: 'boss' });
    const loses = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: '',
      observer: '[[a1b2]]',
      reason: 'x',
    });
    const setup = track(makeSetup('', { createOption }));
    act(() => insertDirective(setup.view, 0, 0, loses));
    await flush();
    const optionInput = formInputs().find((el) => el.placeholder === 'Choose an option…')!;
    typeInto(optionInput, 'Boss');
    await flush();
    expect(formEl().textContent).not.toContain('Create "Boss"');
  });
});

describe('relationship directive form — Remove filtering chain', () => {
  it('queries heldOptions for the tag field with the draft holder and no observer yet', async () => {
    const heldOptions = vi.fn().mockResolvedValue(['member']);
    const observerOptions = vi.fn().mockResolvedValue(['a1b2']);
    const doc = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: '',
      observer: '',
      reason: 'x',
    });
    const setup = track(makeSetup('', { heldOptions, observerOptions }));
    act(() => insertDirective(setup.view, 0, 0, doc));
    await flush();

    expect(heldOptions).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'tg01', holder: 'c3d4', observer: null }),
    );
    // The observer field isn't restricted yet — no tag has been drafted.
    expect(observerOptions).not.toHaveBeenCalled();
  });

  it('queries observerOptions once holder and tag are both drafted', async () => {
    const heldOptions = vi.fn().mockResolvedValue(['member']);
    const observerOptions = vi.fn().mockResolvedValue(['a1b2']);
    const doc = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
      holder: '[[c3d4]]',
      option: 'member',
      observer: '',
      reason: 'x',
    });
    const setup = track(makeSetup('', { heldOptions, observerOptions }));
    act(() => insertDirective(setup.view, 0, 0, doc));
    await flush();

    expect(observerOptions).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 'tg01', holder: 'c3d4', option: 'member' }),
    );
  });
});

describe('relationship directive form placement — stays on screen (pure, realistic numbers)', () => {
  const viewport = { width: 1280, height: 800 };
  const formSize = { width: 320, height: 220 };

  it('opens below when there is room below the block', () => {
    const rect = { top: 100, bottom: 120, left: 40, right: 300, width: 260, height: 20 };
    const placement = computeCaretPlacement(rect, formSize, viewport, 'below');
    expect(placement.side).toBe('below');
    expect(placement.top).toBe(122);
  });

  it('flips above when the block is near the bottom of the screen', () => {
    const rect = { top: 700, bottom: 720, left: 40, right: 300, width: 260, height: 20 };
    const placement = computeCaretPlacement(rect, formSize, viewport, 'below');
    expect(placement.side).toBe('above');
    expect(placement.bottom).toBe(viewport.height - 700 + 2);
  });

  it('caps maxHeight (internal scroll) when the form is taller than the space on the chosen side', () => {
    const rect = { top: 700, bottom: 720, left: 40, right: 300, width: 260, height: 20 };
    const tallForm = { width: 320, height: 900 };
    const placement = computeCaretPlacement(rect, tallForm, viewport, 'below');
    // Neither side fully fits a 900px-tall form; the side with more room wins
    // and the popup's maxHeight caps it there (the form scrolls internally).
    expect(placement.maxHeight).toBeLessThan(tallForm.height);
    expect(placement.left).toBeGreaterThanOrEqual(8);
    expect(placement.left + formSize.width).toBeLessThanOrEqual(viewport.width);
  });
});
