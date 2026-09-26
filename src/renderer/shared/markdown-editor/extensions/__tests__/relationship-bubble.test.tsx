// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { RelationshipBubble, type RelationshipBubbleProps } from '../relationship-bubble';
import { computeCaretPlacement } from '../../../context-menu/caret-position';
import { resolveTrackSpec } from '../../../../../shared/relationships';
import {
  pf2eReputationSpec,
  attitudeSpec,
  relationshipTagsSpec,
} from '../../../../../shared/relationships/system/index';

const REP_TRACK = resolveTrackSpec(pf2eReputationSpec);
const ATTITUDE_TRACK = resolveTrackSpec(attitudeSpec);
const TAGS_TRACK = resolveTrackSpec(relationshipTagsSpec);

let container: HTMLDivElement;
let root: Root;

function setup() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
}

function baseProps(overrides: Partial<RelationshipBubbleProps> = {}): RelationshipBubbleProps {
  return {
    anchor: 0,
    role: 'amount',
    value: '',
    prompt: 'Reputation change',
    track: REP_TRACK,
    trackId: 'rp01',
    defaultReason: 'Unspecified',
    noteOptions: [],
    recentNoteIds: [],
    defaultHolderId: null,
    currentNoteId: null,
    heldOptionKeys: null,
    heldOptionsLoading: false,
    onCommit: vi.fn(),
    onClose: vi.fn(),
    style: {},
    tailSide: 'above',
    listMaxHeight: null,
    visible: true,
    tailOffset: 16,
    ...overrides,
  };
}

function render(props: RelationshipBubbleProps) {
  act(() => root.render(createElement(RelationshipBubble, props)));
}

function input(): HTMLInputElement {
  return container.querySelector('input')!;
}

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  vi.restoreAllMocks();
});

function tracked() {
  setup();
  cleanups.push(teardown);
}

describe('amount field — default value, digit filtering, stepper buttons', () => {
  it('starts at 1 when the blank is empty', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '' }));
    expect(input().value).toBe('1');
  });

  it('a numeric value blank starts at the track-clamped 1 when the blank is empty', () => {
    tracked();
    render(baseProps({ role: 'value', value: '', track: REP_TRACK }));
    // 1 is within [min, max] for the reputation track, so it's used as-is.
    expect(input().value).toBe('1');
  });

  it('rejects non-numeric keystrokes at the input level', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '2' }));
    fireEvent.change(input(), { target: { value: '2a' } });
    expect(input().value).toBe('2');
    fireEvent.change(input(), { target: { value: '-3' } });
    expect(input().value).toBe('-3');
  });

  it('rejects a decimal point on an integer-step track', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '2' }));
    fireEvent.change(input(), { target: { value: '2.5' } });
    expect(input().value).toBe('2');
  });

  it('the stepper buttons do the same as ArrowUp/ArrowDown', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '2' }));
    const buttons = container.querySelectorAll('.relationship-bubble-stepper-button');
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    expect(input().value).toBe('3');
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[1]);
    expect(input().value).toBe('1');
  });

  it('selects the field text once visible, so typing replaces an existing value', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '42' }));
    const el = input();
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(el.value.length);
  });
});

describe('amount field — validation and stepping', () => {
  it('invalid input blocks advancing with an inline message (zero, non-number)', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'amount', value: '-2', onCommit }));

    fireEvent.change(input(), { target: { value: '0' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Amount cannot be zero');

    // Letters are rejected at the input level (see the "digit filtering"
    // tests above), so they never reach validation. A lone sign still gets
    // through the input filter (it may still be mid-typed) and is caught by
    // `validateAmount` at commit time instead.
    fireEvent.change(input(), { target: { value: 'abc' } });
    expect(input().value).toBe('0');
    fireEvent.change(input(), { target: { value: '-' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('"-" is not a number');

    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('5', 'advance');
  });

  it('Up/Down step the number by the track step; nothing else does', () => {
    tracked();
    render(baseProps({ role: 'amount', value: '2' }));
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input().value).toBe('3');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().value).toBe('1');
    fireEvent.keyDown(input(), { key: 'a' });
    expect(input().value).toBe('1');
  });

  it('Tab advances, Shift+Tab goes back, Escape closes', () => {
    tracked();
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(baseProps({ role: 'amount', value: '4', onCommit, onClose }));

    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(onCommit).toHaveBeenLastCalledWith('4', 'advance');

    fireEvent.keyDown(input(), { key: 'Tab', shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith('4', 'back');

    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape does not bubble past the field, so a host document listener never sees it', () => {
    tracked();
    const onDocumentEscape = vi.fn();
    document.addEventListener('keydown', onDocumentEscape);
    try {
      render(baseProps({ role: 'amount', value: '4' }));
      fireEvent.keyDown(input(), { key: 'Escape' });
      expect(onDocumentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', onDocumentEscape);
    }
  });

  it('Left at the start / Right at the end hop; otherwise move within the input', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'amount', value: '42', onCommit }));
    const el = input();
    el.setSelectionRange(0, 0);
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith('42', 'hop-prev');

    onCommit.mockClear();
    el.setSelectionRange(el.value.length, el.value.length);
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith('42', 'hop-next');
  });
});

describe('numeric value field (set action) — clamped stepping and validation', () => {
  it('rejects an out-of-range value', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'value', value: '10', track: REP_TRACK, onCommit }));
    fireEvent.change(input(), { target: { value: '999' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('out of range');
  });

  it('Up/Down clamp to [min, max]', () => {
    tracked();
    render(baseProps({ role: 'value', value: '50', track: REP_TRACK }));
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input().value).toBe('50');
  });
});

describe('ordinal value field — rung picker', () => {
  it('moves through the rung list and picks one', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'value', value: 'indifferent', track: ATTITUDE_TRACK, onCommit }));
    const rows = () => Array.from(container.querySelectorAll('.searchable-picker-row'));
    expect(rows().map((r) => r.textContent)).toContain('Friendly');
    fireEvent.mouseDown(rows().find((r) => r.textContent === 'Helpful')!);
    expect(onCommit).toHaveBeenCalledWith('helpful', 'advance');
  });
});

describe('reason field', () => {
  it('shows the default reason as placeholder; Enter on empty keeps it empty', () => {
    tracked();
    const onCommit = vi.fn();
    render(
      baseProps({
        role: 'reason',
        value: '',
        track: null,
        defaultReason: 'Battle of Dawn',
        onCommit,
      }),
    );
    expect(input().placeholder).toBe('Battle of Dawn');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('', 'advance');
  });

  it('strips braces from typed text before committing', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'reason', value: '', track: null, onCommit }));
    fireEvent.change(input(), { target: { value: 'a {b} c' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('a b c', 'advance');
  });
});

describe('holder/observer note pickers', () => {
  const NOTE_OPTIONS = [
    { id: 'a1b2', path: 'npcs/mira', label: 'Mira' },
    { id: 'c3d4', path: 'factions/party', label: 'The Party' },
  ];

  it('holder is pre-filled with the default holder; Tab accepts it', () => {
    tracked();
    const onCommit = vi.fn();
    render(
      baseProps({
        role: 'holder',
        value: '',
        track: REP_TRACK,
        noteOptions: NOTE_OPTIONS,
        defaultHolderId: 'c3d4',
        onCommit,
      }),
    );
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith('c3d4', 'advance');
  });

  it('awaits an async onHolderChosenWithoutDefault before committing, so the value is only written once any confirm dialog is gone', async () => {
    tracked();
    const onCommit = vi.fn();
    let resolveConfirm: () => void = () => {};
    const onHolderChosenWithoutDefault = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      baseProps({
        role: 'holder',
        value: '',
        track: REP_TRACK,
        noteOptions: NOTE_OPTIONS,
        defaultHolderId: null,
        onHolderChosenWithoutDefault,
        onCommit,
      }),
    );
    const row = Array.from(container.querySelectorAll('.searchable-picker-row')).find(
      (r) => r.textContent === 'Mira',
    )!;
    fireEvent.mouseDown(row);
    expect(onHolderChosenWithoutDefault).toHaveBeenCalledWith('a1b2');
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfirm();
      await Promise.resolve();
    });
    expect(onCommit).toHaveBeenCalledWith('a1b2', 'advance');
  });

  it('choosing a holder with no default calls the offer callback', async () => {
    tracked();
    const onCommit = vi.fn();
    const onHolderChosenWithoutDefault = vi.fn();
    render(
      baseProps({
        role: 'holder',
        value: '',
        track: REP_TRACK,
        noteOptions: NOTE_OPTIONS,
        defaultHolderId: null,
        onHolderChosenWithoutDefault,
        onCommit,
      }),
    );
    const row = Array.from(container.querySelectorAll('.searchable-picker-row')).find(
      (r) => r.textContent === 'Mira',
    )!;
    fireEvent.mouseDown(row);
    expect(onHolderChosenWithoutDefault).toHaveBeenCalledWith('a1b2');
    // `onHolderChosenWithoutDefault` is awaited before committing (see the
    // "awaits an async onHolderChosenWithoutDefault…" test above) — even a
    // synchronous (non-Promise) return still takes one microtask tick.
    await act(async () => {
      await Promise.resolve();
    });
    expect(onCommit).toHaveBeenCalledWith('a1b2', 'advance');
  });
});

describe('field query does not leak between roles (RelationshipBubble, keyed by anchor:role)', () => {
  const NOTE_OPTIONS = [
    { id: 'a1b2', path: 'npcs/obelix', label: 'Obelix' },
    { id: 'c3d4', path: 'factions/party', label: 'The Party' },
  ];

  it('typing into the observer picker does not show up when the bubble moves to the holder blank', () => {
    tracked();
    act(() =>
      root.render(
        createElement(RelationshipBubble, {
          ...baseProps({
            anchor: 0,
            role: 'observer',
            value: '',
            track: REP_TRACK,
            noteOptions: NOTE_OPTIONS,
          }),
        }),
      ),
    );
    fireEvent.change(input(), { target: { value: 'ob' } });
    expect(input().value).toBe('ob');

    // The bubble moves to a different blank on the SAME directive (same
    // anchor, different role) — a fresh field instance should mount with
    // its own, empty query rather than reusing the observer field's typed
    // text.
    act(() =>
      root.render(
        createElement(RelationshipBubble, {
          ...baseProps({
            anchor: 0,
            role: 'holder',
            value: '',
            track: REP_TRACK,
            noteOptions: NOTE_OPTIONS,
          }),
        }),
      ),
    );
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('Holder…');
  });
});

describe('option field — create row and held-options filtering', () => {
  const OPTIONS_TRACK = TAGS_TRACK;

  it('an unknown option offers a Create row with a mutual checkbox and applies the returned key', async () => {
    tracked();
    const onCommit = vi.fn();
    const createOption = vi.fn().mockResolvedValue({ key: 'rival' });
    render(
      baseProps({
        role: 'option',
        value: '',
        track: OPTIONS_TRACK,
        trackId: 'tg01',
        heldOptionKeys: null,
        createOption,
        onCommit,
      }),
    );
    fireEvent.change(input(), { target: { value: 'rivals' } });
    const createRow = container.querySelector('.searchable-picker-create-row')!;
    expect(createRow).not.toBeNull();
    expect(createRow.textContent).toContain('Create');
    expect(createRow.textContent).toContain('Symmetrical');

    const checkbox = createRow.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    await act(async () => {
      fireEvent.mouseDown(createRow);
      await Promise.resolve();
    });
    expect(createOption).toHaveBeenCalledWith('tg01', 'rivals', true);
    expect(onCommit).toHaveBeenCalledWith('rival', 'advance');
  });

  it('a remove action offers only held options', () => {
    tracked();
    render(
      baseProps({
        role: 'option',
        value: '',
        track: OPTIONS_TRACK,
        heldOptionKeys: ['hates'],
      }),
    );
    const rows = Array.from(container.querySelectorAll('.searchable-picker-row')).map(
      (r) => r.textContent,
    );
    expect(rows).toEqual(['hates']);
  });

  it('shows every option when the host gives no held-options list', () => {
    tracked();
    render(baseProps({ role: 'option', value: '', track: OPTIONS_TRACK, heldOptionKeys: null }));
    const rows = Array.from(container.querySelectorAll('.searchable-picker-row'));
    expect(rows.length).toBe(
      OPTIONS_TRACK.kind === 'categorical' ? OPTIONS_TRACK.options.length : 0,
    );
  });

  it('shows a loading state and no options while heldOptions is resolving', () => {
    tracked();
    render(
      baseProps({
        role: 'option',
        value: '',
        track: OPTIONS_TRACK,
        heldOptionKeys: null,
        heldOptionsLoading: true,
      }),
    );
    expect(container.querySelector('.relationship-bubble-loading')?.textContent).toBe('Loading…');
    expect(container.querySelectorAll('.searchable-picker-row').length).toBe(0);
  });

  it('ArrowDown/Up move freely while editing an existing option — no snap-back', () => {
    tracked();
    const onCommit = vi.fn();
    render(
      baseProps({
        role: 'option',
        value: 'hates',
        track: OPTIONS_TRACK,
        heldOptionKeys: null,
        onCommit,
      }),
    );
    const rowText = () =>
      Array.from(container.querySelectorAll('.searchable-picker-row.is-highlighted')).map(
        (r) => r.textContent,
      );
    const highlightedBefore = rowText();
    expect(highlightedBefore).toEqual(['hates']);

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    const highlightedAfter = rowText();
    expect(highlightedAfter).not.toEqual(highlightedBefore);

    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(expect.any(String), 'advance');
    expect(onCommit).not.toHaveBeenCalledWith('hates', 'advance');
  });
});

describe('bubble placement (pure, via computeCaretPlacement)', () => {
  it('prefers above and flips below when there is no room above', () => {
    const viewport = { width: 800, height: 600 };
    const lineNearTop = { top: 20, left: 50, right: 150, bottom: 40, width: 100, height: 20 };
    const size = { width: 240, height: 120 };

    const aboveFits = computeCaretPlacement(
      { top: 300, left: 50, right: 150, bottom: 320, width: 100, height: 20 },
      size,
      viewport,
      'above',
    );
    expect(aboveFits.side).toBe('above');

    const flips = computeCaretPlacement(lineNearTop, size, viewport, 'above');
    expect(flips.side).toBe('below');
  });
});
