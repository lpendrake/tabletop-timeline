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
    onCommit: vi.fn(),
    onClose: vi.fn(),
    style: {},
    tailSide: 'above',
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

describe('amount field — validation and stepping', () => {
  it('invalid input blocks advancing with an inline message (zero, non-number)', () => {
    tracked();
    const onCommit = vi.fn();
    render(baseProps({ role: 'amount', value: '-2', onCommit }));

    fireEvent.change(input(), { target: { value: '0' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Amount cannot be zero');

    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Amount must be a number');

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

  it('choosing a holder with no default calls the offer callback', () => {
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
    expect(onCommit).toHaveBeenCalledWith('a1b2', 'advance');
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
    const createRow = container.querySelector('.relationship-bubble-create-row')!;
    expect(createRow).not.toBeNull();
    expect(createRow.textContent).toContain('Create');

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
    const rows = Array.from(container.querySelectorAll('.relationship-bubble-row')).map(
      (r) => r.textContent,
    );
    expect(rows).toEqual(['hates']);
  });

  it('shows every option when the host gives no held-options list', () => {
    tracked();
    render(baseProps({ role: 'option', value: '', track: OPTIONS_TRACK, heldOptionKeys: null }));
    const rows = Array.from(container.querySelectorAll('.relationship-bubble-row'));
    expect(rows.length).toBe(
      OPTIONS_TRACK.spec.kind === 'categorical' ? OPTIONS_TRACK.spec.options.length : 0,
    );
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
