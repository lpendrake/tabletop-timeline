// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { relationshipDirectives, setDirectiveContext } from '../relationship-directives';
import {
  isRelationshipBubbleOpen,
  relationshipBubble,
  type RelationshipBubbleHostContext,
} from '../relationship-bubble-view-plugin';
import { bubbleStateField, insertDirective } from '../relationship-bubble-state';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
} from '../../../../../shared/relationships/system/index';

/** Waits for the microtask + rAF the bubble uses to reposition/focus after opening. */
async function flushBubbleOpen(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;

const FULL_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

interface Setup {
  view: EditorView;
  container: HTMLDivElement;
}

function makeView(doc: string, ctx: Partial<RelationshipBubbleHostContext> = {}): Setup {
  const context: RelationshipBubbleHostContext = {
    library: { custom: [], optionAdditions: {} },
    defaultReason: 'Unspecified',
    noteOptions: () => [
      { id: 'a1b2', path: 'a1b2', label: 'White Tigers' },
      { id: 'c3d4', path: 'c3d4', label: 'The Party' },
    ],
    ...ctx,
  };

  const state = EditorState.create({
    doc,
    extensions: [history(), relationshipDirectives({}), relationshipBubble(() => context)],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView({ state, parent: container });
  act(() => {
    view.dispatch({
      effects: setDirectiveContext.of({
        library: { custom: [], optionAdditions: {} },
        defaultReason: 'Unspecified',
      }),
    });
  });
  return { view, container };
}

function destroy({ view, container }: Setup): void {
  view.destroy();
  container.remove();
}

let cleanup: Setup[] = [];
afterEach(() => {
  cleanup.forEach(destroy);
  cleanup = [];
  document.querySelectorAll('.relationship-bubble-host').forEach((el) => el.remove());
});

function track(setup: Setup): Setup {
  cleanup.push(setup);
  return setup;
}

function bubbleInput(): HTMLInputElement {
  const host = document.querySelector('.relationship-bubble-host')!;
  return host.querySelector('input')!;
}

describe('relationship bubble — full mount', () => {
  it('clicking a finished value reopens its bubble with the current value and rewrites only that token', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { defaultReason: 'Unspecified' }));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;

    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(view.state.field(bubbleStateField)).toEqual({ anchor: 0, role: 'amount' });
    expect(bubbleInput().value).toBe('-2');

    act(() => {
      fireEvent.change(bubbleInput(), { target: { value: '9' } });
    });
    act(() => {
      fireEvent.keyDown(bubbleInput(), { key: 'Enter' });
    });

    expect(view.state.doc.toString()).toBe(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '9',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'attacked their warehouse',
      }),
    );
  });

  it("Ctrl+Z inside the bubble's input does not undo the document", () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;

    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    const docBefore = view.state.doc.toString();
    const el = bubbleInput();
    // The bubble's input is mounted on document.body, entirely outside
    // view.dom — CodeMirror's own keymap (attached to view.dom) never sees
    // this event, so document undo can't fire from it.
    act(() => {
      fireEvent.keyDown(el, { key: 'z', ctrlKey: true });
    });
    expect(view.state.doc.toString()).toBe(docBefore);
  });
});

describe('relationship bubble — async heldOptions', () => {
  const LOSES_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'loses')!.template;
  const LOSES_DIRECTIVE = serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
    holder: '[[c3d4]]',
    observer: '[[a1b2]]',
    reason: 'a falling out',
  });

  function optionField(): HTMLElement {
    return document.querySelector('.relationship-bubble-field')!;
  }

  it('shows a loading state until heldOptions resolves, then only the held options', async () => {
    let resolveFn: (keys: string[]) => void = () => {};
    const heldOptions = () =>
      new Promise<string[]>((resolve) => {
        resolveFn = resolve;
      });
    const setup = track(makeView(LOSES_DIRECTIVE, { heldOptions }));
    const { view } = setup;
    const optionValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-option')!;

    act(() => {
      optionValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();

    expect(optionField().textContent).toBe('Loading…');
    expect(document.querySelectorAll('.searchable-picker-row').length).toBe(0);

    await act(async () => {
      resolveFn(['hates']);
      await Promise.resolve();
    });

    const rows = Array.from(document.querySelectorAll('.searchable-picker-row'));
    expect(rows.map((r) => r.textContent)).toEqual(['hates']);
  });

  it('ignores a stale response once a newer request supersedes it', async () => {
    const resolvers: Array<(keys: string[]) => void> = [];
    const calls: Array<{ holder: string | null; observer: string | null }> = [];
    const heldOptions = (q: { holder: string | null; observer: string | null }) => {
      calls.push(q);
      return new Promise<string[]>((resolve) => {
        resolvers.push(resolve);
      });
    };
    const setup = track(makeView(`x ${LOSES_DIRECTIVE}`, { heldOptions }));
    const { view } = setup;
    const optionValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-option')!;

    act(() => {
      optionValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();
    expect(calls.length).toBe(1);

    // Edit the document above the directive (its anchor shifts, but the
    // bubble stays open on the same blank) before the first request
    // resolves — a fresh sync() asks again, bumping the token.
    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'more ' } });
    });
    await flushBubbleOpen();
    expect(calls.length).toBe(2);

    // The FIRST (now-stale) request resolves after the second one started.
    await act(async () => {
      resolvers[0](['stale-result']);
      await Promise.resolve();
    });

    // Still loading — the stale response must not have been applied.
    expect(optionField().textContent).toBe('Loading…');

    await act(async () => {
      resolvers[1](['hates']);
      await Promise.resolve();
    });
    const rows = Array.from(document.querySelectorAll('.searchable-picker-row'));
    expect(rows.map((r) => r.textContent)).toEqual(['hates']);
  });
});

describe('relationship bubble — close on click-outside', () => {
  it('isRelationshipBubbleOpen reflects whether a bubble is currently open', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    expect(isRelationshipBubbleOpen()).toBe(false);

    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;
    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(isRelationshipBubbleOpen()).toBe(true);
    expect(isRelationshipBubbleOpen(bubbleInput())).toBe(true);
    expect(isRelationshipBubbleOpen(view.dom)).toBe(false);

    act(() => {
      fireEvent.keyDown(bubbleInput(), { key: 'Escape' });
    });
    expect(isRelationshipBubbleOpen()).toBe(false);
  });

  it('a pointerdown outside the bubble closes it without eating the click', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view, container } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;
    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(view.state.field(bubbleStateField)).not.toBeNull();

    const outsideTarget = document.createElement('button');
    let clicked = false;
    outsideTarget.addEventListener('click', () => {
      clicked = true;
    });
    container.appendChild(outsideTarget);

    act(() => {
      outsideTarget.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
      outsideTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(view.state.field(bubbleStateField)).toBeNull();
    expect(clicked).toBe(true); // the click still did its own thing

    outsideTarget.remove();
  });

  it('a pointerdown inside the bubble does not close it', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;
    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    act(() => {
      bubbleInput().dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
    });
    expect(view.state.field(bubbleStateField)).not.toBeNull();
  });
});

describe('relationship bubble — focus', () => {
  it('takes keyboard focus after a directive is inserted via the same path the / menu uses', async () => {
    const setup = track(makeView(''));
    const { view } = setup;
    const template = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
    const text = serialiseTemplate('rp01', 'change', template);

    // Mirrors `editor-menu.ts`'s `onSelect`: the menu's own `restoreFocus`
    // already gave the view focus by the time an action runs, then the
    // action calls `insertDirective` — which is what actually opens the
    // bubble. The bubble must still end up with focus afterwards.
    act(() => {
      view.focus();
      insertDirective(view, 0, 0, text);
    });

    await flushBubbleOpen();

    expect(document.activeElement).toBe(bubbleInput());
  });

  it('takes keyboard focus when a blank is opened by clicking its rendered value', async () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;

    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    await flushBubbleOpen();

    expect(document.activeElement).toBe(bubbleInput());
  });
});

describe('relationship bubble — placement fit via list ref', () => {
  /**
   * `computePlacement` in `relationship-bubble-view-plugin.ts` measures the
   * option list (and its first row) off the `listRef` it hands the
   * `SearchablePicker` — never a `.searchable-picker-list` /
   * `.searchable-picker-row` selector. These tests mock the real geometry
   * (`coordsAtPos`, the host/list/row heights, the viewport) that plan is
   * built from, so a passing assertion here can only mean the plugin read
   * those mocked heights off the held reference.
   */
  function mockLineRect(view: EditorView, top: number, bottom: number): void {
    vi.spyOn(view, 'coordsAtPos').mockReturnValue({
      left: 100,
      right: 150,
      top,
      bottom,
    } as ReturnType<EditorView['coordsAtPos']>);
  }

  function mockGeometry(innerHeight: number): void {
    vi.stubGlobal('innerHeight', innerHeight);
    const host = document.querySelector<HTMLElement>('.relationship-bubble-host')!;
    const list = document.querySelector<HTMLElement>('.searchable-picker-list')!;
    const row = list.firstElementChild as HTMLElement;
    Object.defineProperty(host, 'offsetHeight', { value: 300, configurable: true });
    Object.defineProperty(list, 'offsetHeight', { value: 250, configurable: true });
    Object.defineProperty(row, 'offsetHeight', { value: 20, configurable: true });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shrinks the option list, but stays above, when only a shrunk list fits', async () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    mockLineRect(view, 160, 180);
    const holderValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    act(() => {
      holderValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    mockGeometry(500);
    await flushBubbleOpen();

    const list = document.querySelector<HTMLElement>('.searchable-picker-list')!;
    // space.above = 160 - GAP(2) - EDGE_MARGIN(8) = 150; chromeHeight =
    // host(300) - list(250) = 50 → shrunk max height = 150 - 50 = 100.
    expect(list.style.maxHeight).toBe('100px');
    const bubble = document.querySelector<HTMLElement>('.relationship-bubble')!;
    // Stays above: positioned via `bottom`, not `top`.
    expect(bubble.style.bottom).not.toBe('');
    expect(bubble.style.top).toBe('');
  });

  it('flips below the line when even a shrunk list would not fit above', async () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    mockLineRect(view, 20, 40);
    const holderValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    act(() => {
      holderValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    mockGeometry(500);
    await flushBubbleOpen();

    const bubble = document.querySelector<HTMLElement>('.relationship-bubble')!;
    // space.above = 20 - 2 - 8 = 10, too small even shrunk to the minimum
    // visible rows → flips below, where the full (unshrunk) list fits.
    expect(bubble.style.top).not.toBe('');
    expect(bubble.style.bottom).toBe('');
    const list = document.querySelector<HTMLElement>('.searchable-picker-list')!;
    expect(list.style.maxHeight).toBe('');
  });
});
