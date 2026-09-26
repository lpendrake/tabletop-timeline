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
import { resetRecentNoteIdsForTests } from '../relationship-recent-notes';
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
   * bubble's own root (held via `bubbleRef`) and the option list/first row
   * (held via `listRef`) — never a `.relationship-bubble-host` /
   * `.searchable-picker-list` / `.searchable-picker-row` selector. These
   * tests mock the real geometry (`coordsAtPos`, the bubble/list/row
   * heights, the viewport) that the plan is built from, so a passing
   * assertion here can only mean the plugin read those mocked heights off
   * the held references.
   *
   * `.relationship-bubble-host` itself is deliberately left unmeasured
   * (and, in a real browser, collapses to 0×0 — see
   * `mockGeometryReadsCollapsedHostAsZero` below): it's `position: fixed`
   * and its only child (`.relationship-bubble`, the actual bubble root) is
   * `position: fixed` too, so the child never contributes to the host's own
   * box size. jsdom doesn't compute real layout, so it never reproduced
   * that collapse — which is why these tests must mock the *bubble root*'s
   * height, not the host's, to stay honest about which element production
   * code reads.
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
    const bubble = document.querySelector<HTMLElement>('.relationship-bubble')!;
    const list = document.querySelector<HTMLElement>('.searchable-picker-list')!;
    const row = list.firstElementChild as HTMLElement;
    Object.defineProperty(bubble, 'offsetHeight', { value: 300, configurable: true });
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
    // bubble(300) - list(250) = 50 → shrunk max height = 150 - 50 = 100.
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

  /**
   * Regression test for the real-app bug (#262): a directive near the top
   * of the event editor opened a holder/observer bubble that rendered off
   * the top of the window. Root cause was `computePlacement` measuring
   * `.relationship-bubble-host` (which is `position: fixed` and whose only
   * child, the actual bubble root, is `position: fixed` too — so the child
   * never contributes to the host's own box, and a real browser collapses
   * it to 0×0) instead of the bubble's own root. The 0×0 host fell back to
   * a hardcoded 240×80 "full height" guess, which corrupted the
   * chrome/list-height split `planBubbleFit` relies on and could place the
   * (still much taller) real bubble mostly above the top of the viewport.
   *
   * jsdom never reproduces that collapse (it doesn't compute real layout),
   * so this test stubs the host at 0 explicitly — the numbers below are the
   * real ones measured from the Electron app: a 15-option holder list, an
   * ~320px unshrunk bubble, an ~27px row, a directive line 54–73px from the
   * top of a short (260px) window.
   */
  it('measures the bubble root, not the collapsed host, so it stays fully on screen', async () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    mockLineRect(view, 54, 73);
    const holderValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-holder')!;

    act(() => {
      holderValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    vi.stubGlobal('innerHeight', 260);
    const host = document.querySelector<HTMLElement>('.relationship-bubble-host')!;
    const bubble = document.querySelector<HTMLElement>('.relationship-bubble')!;
    const list = document.querySelector<HTMLElement>('.searchable-picker-list')!;
    const row = list.firstElementChild as HTMLElement;
    // The real, uncollapsed host — a fixed-positioned parent of a
    // fixed-positioned child always measures 0×0 in a real browser.
    Object.defineProperty(host, 'offsetWidth', { value: 0, configurable: true });
    Object.defineProperty(host, 'offsetHeight', { value: 0, configurable: true });
    Object.defineProperty(bubble, 'offsetWidth', { value: 222, configurable: true });
    Object.defineProperty(bubble, 'offsetHeight', { value: 320, configurable: true });
    Object.defineProperty(list, 'offsetHeight', { value: 247, configurable: true });
    Object.defineProperty(row, 'offsetHeight', { value: 27, configurable: true });
    await flushBubbleOpen();

    // space.above = 54 - GAP(2) - EDGE_MARGIN(8) = 44, too small even for the
    // minimum shrunk list (chrome 73 + 3 rows of 27 = 154) → flips below.
    // space.below = 260 - EDGE_MARGIN(8) - (73 + GAP(2)) = 177; the full
    // 320px bubble doesn't fit, so the list shrinks to 177 - 73 = 104.
    expect(bubble.style.top).toBe('75px');
    expect(bubble.style.bottom).toBe('');
    expect(list.style.maxHeight).toBe('104px');

    // The whole bubble (chrome + shrunk list) must land fully on screen.
    const total = 73 + 104;
    const top = 75;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + total).toBeLessThanOrEqual(260);
  });
});

describe('relationship bubble — recent notes are shared across editor instances (#262 bug 11)', () => {
  afterEach(() => {
    resetRecentNoteIdsForTests();
  });

  it('picking a holder in one editor instance shows up in another instance’s recents', async () => {
    resetRecentNoteIdsForTests();

    // Two entirely separate mounts — a stand-in for "the note editor" and
    // "the event editor" (or two open editor tabs): separate EditorViews,
    // separate ViewPlugin instances, no shared React state between them.
    // The only thing that can make one see the other's pick is the shared,
    // non-React `relationship-recent-notes` module.
    const editorA = track(makeView(FULL_CHANGE_DIRECTIVE));
    const editorB = track(makeView(FULL_CHANGE_DIRECTIVE));

    const holderInA = editorA.view.dom.querySelector<HTMLElement>(
      '.cm-directive-value-role-holder',
    )!;
    act(() => {
      holderInA.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();

    // Pick "White Tigers" (a1b2) — the directive already holds "The Party"
    // (c3d4), so this is a genuine change, not a no-op re-commit.
    fireEvent.change(bubbleInput(), { target: { value: 'a1b2' } });
    fireEvent.keyDown(bubbleInput(), { key: 'Enter' });
    await flushBubbleOpen();

    // The shared store already has it, independent of any UI...
    const { getRecentNoteIds } = await import('../relationship-recent-notes');
    expect(getRecentNoteIds()[0]).toBe('a1b2');

    // ...and a bubble opened in the OTHER, unrelated editor instance reads
    // it back: "White Tigers" now ranks first (recents-first ordering; see
    // `picker-model.ts`'s `recentsFirst`) even though editor B never picked
    // anything itself.
    const holderInB = editorB.view.dom.querySelector<HTMLElement>(
      '.cm-directive-value-role-holder',
    )!;
    act(() => {
      holderInB.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();

    const firstRow = document.querySelector<HTMLElement>('.searchable-picker-row');
    expect(firstRow?.textContent).toBe('White Tigers');
  });

  it('survives the editor unmounting and remounting (simulating a view switch)', async () => {
    resetRecentNoteIdsForTests();

    const first = makeView(FULL_CHANGE_DIRECTIVE);
    const holderValue = first.view.dom.querySelector<HTMLElement>(
      '.cm-directive-value-role-holder',
    )!;
    act(() => {
      holderValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();
    fireEvent.change(bubbleInput(), { target: { value: 'a1b2' } });
    fireEvent.keyDown(bubbleInput(), { key: 'Enter' });
    await flushBubbleOpen();

    // Unmount everything (as switching away from this view would) — no
    // per-instance recents state survives this on its own.
    destroy(first);
    document.querySelectorAll('.relationship-bubble-host').forEach((el) => el.remove());

    // Remount fresh and open a bubble again: the shared module (not any
    // component instance) is what remembers the pick.
    const second = track(makeView(FULL_CHANGE_DIRECTIVE));
    const holderAgain = second.view.dom.querySelector<HTMLElement>(
      '.cm-directive-value-role-holder',
    )!;
    act(() => {
      holderAgain.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flushBubbleOpen();

    const firstRow = document.querySelector<HTMLElement>('.searchable-picker-row');
    expect(firstRow?.textContent).toBe('White Tigers');
  });
});
