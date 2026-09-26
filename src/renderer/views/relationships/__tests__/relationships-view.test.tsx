// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';

import { parseDirectives } from '../../../../shared/relationships';
import type { Ledger, RelationshipDelta } from '../../../../shared/relationships';
import type { InvalidDirectiveEntry } from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';

// ---- Hoisted mock state (mutable across a test, read inside the mock factories) ----

const state = vi.hoisted(() => ({
  ledgers: [] as Ledger[],
  invalid: [] as InvalidDirectiveEntry[],
  filesByPath: {} as Record<string, { title?: string; directives: unknown[] }>,
  getDirectivesSpy: vi.fn(),
  getAllLedgersSpy: vi.fn(),
  onChangedCb: null as ((data: { paths: string[] }) => void) | null,
  showContextMenuSpy: vi.fn(),
}));

vi.mock('../../../relationships/data', () => ({
  relationshipsData: {
    getTracks: vi.fn().mockResolvedValue({ custom: [], optionAdditions: {} }),
    getAllLedgers: (...args: unknown[]) => {
      state.getAllLedgersSpy(...args);
      return Promise.resolve(state.ledgers);
    },
    getInvalid: () => Promise.resolve(state.invalid),
    getDirectives: (paths: string[]) => {
      state.getDirectivesSpy(paths);
      return Promise.resolve(
        paths.map((path) => ({
          path,
          title: state.filesByPath[path]?.title,
          directives: state.filesByPath[path]?.directives ?? [],
        })),
      );
    },
    onChanged: (cb: (data: { paths: string[] }) => void) => {
      state.onChangedCb = cb;
      return () => {
        state.onChangedCb = null;
      };
    },
  },
}));

vi.mock('../../../timeline/data/ports', () => ({
  timelinePort: {
    getState: vi.fn().mockResolvedValue({ in_game_now_seconds: 100 }),
  },
}));

vi.mock('../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../shared/context-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/context-menu')>();
  return {
    ...actual,
    showContextMenu: (...args: Parameters<typeof actual.showContextMenu>) => {
      state.showContextMenuSpy(...args);
      return { close: () => {} };
    },
  };
});

// ---- Imports after mocks ----

import { RelationshipsView } from '../relationships-view';

// ---- Test data ----
//
// aaaa (Zara) holds a PF2E Reputation ledger on bbbb (Anna): one applied
// adjust step, one future set step (declared in an event, "timeline/meeting.md").
// aaaa (Zara) also holds an Attitude ledger on cccc (Mira) with only a future
// delta (only-future fade).
// cccc (Mira) holds a mutual "married" tag with bbbb (Anna), declared on a
// note ("notes/npcs/cccc.md"); its mirror lives on bbbb's ledger toward cccc.

const labels: Record<string, string> = { aaaa: 'Zara', bbbb: 'Anna', cccc: 'Mira' };
const entityLabelMap = new Map(Object.entries(labels));

function delta(
  partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
): RelationshipDelta {
  return { at: null, declaredIn: { path: 'a.md', ordinal: 0 }, ...partial } as RelationshipDelta;
}

function ledger(
  holder: string,
  observer: string,
  track: string,
  deltas: RelationshipDelta[],
): Ledger {
  return { holder, observer, track, deltas };
}

const meetingSource =
  '{{rp01.change {amount:10} {observer:[[bbbb]]} rep for {holder:[[aaaa]]} — {reason:Helped defend the town}}}\n' +
  '{{rp01.set {holder:[[aaaa]]} rep is {value:20} with {observer:[[bbbb]]} — {reason:}}}';

const cccdSource =
  '{{tg01.gains {holder:[[cccc]]} is now {option:married} with {observer:[[bbbb]]} — {reason:}}}';

function resetFixtures() {
  const meetingParsed = parseDirectives(meetingSource).directives;
  const cccdParsed = parseDirectives(cccdSource).directives;

  state.filesByPath = {
    'timeline/meeting.md': { title: 'Meeting at the docks', directives: meetingParsed },
    'notes/npcs/cccc.md': { directives: cccdParsed },
  };

  state.ledgers = [
    ledger('aaaa', 'bbbb', 'rp01', [
      delta({
        op: 'adjust',
        by: 10,
        at: 50,
        declaredIn: { path: 'timeline/meeting.md', ordinal: 0 },
      }),
      delta({
        op: 'set',
        value: 20,
        at: 200,
        declaredIn: { path: 'timeline/meeting.md', ordinal: 1 },
      }),
    ]),
    ledger('aaaa', 'cccc', 'at01', [
      delta({ op: 'set', value: 'friendly', at: 300, declaredIn: { path: 'x.md', ordinal: 0 } }),
    ]),
    ledger('cccc', 'bbbb', 'tg01', [
      delta({
        op: 'add',
        key: 'married',
        at: null,
        declaredIn: { path: 'notes/npcs/cccc.md', ordinal: 0 },
      }),
    ]),
    ledger('bbbb', 'cccc', 'tg01', [
      delta({
        op: 'add',
        key: 'married',
        at: null,
        declaredIn: { path: 'notes/npcs/cccc.md', ordinal: 0 },
        mirrored: true,
      }),
    ]),
  ];

  state.invalid = [
    { path: 'notes/bad.md', ordinal: 0, from: 0, to: 10, messages: ['Unknown note [[zzzz]]'] },
  ];

  state.getDirectivesSpy.mockClear();
  state.getAllLedgersSpy.mockClear();
  state.onChangedCb = null;
  state.showContextMenuSpy.mockClear();
}

// ---- window.fsApi (used directly by view-order-data.ts, the relationships
// view's own order/collapse-state persistence layer) ----

const fsApi = {
  readSpy: vi.fn().mockResolvedValue(null),
  writeSpy: vi.fn().mockResolvedValue(true),
  mkdirSpy: vi.fn().mockResolvedValue(true),
};

function setupFsApi() {
  fsApi.readSpy = vi.fn().mockResolvedValue(null);
  fsApi.writeSpy = vi.fn().mockResolvedValue(true);
  fsApi.mkdirSpy = vi.fn().mockResolvedValue(true);
  Object.defineProperty(window, 'fsApi', {
    configurable: true,
    value: {
      read: (path: string) => fsApi.readSpy(path),
      write: (path: string, content: string) => fsApi.writeSpy(path, content),
      mkdir: (path: string) => fsApi.mkdirSpy(path),
    },
  });
}

/** Waits out the view-order save debounce (300ms) plus a little slack. */
async function flushSaveDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

// ---- Test harness ----

let container: HTMLDivElement;
let root: Root;
let footerSlot: HTMLDivElement;

function setup() {
  resetFixtures();
  setupFsApi();
  container = document.createElement('div');
  document.body.appendChild(container);
  footerSlot = document.createElement('div');
  footerSlot.id = 'footer-slot-right';
  document.body.appendChild(footerSlot);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
  footerSlot.remove();
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderView(
  overrides: { onOpenById?: (id: string) => void; onOpenEvent?: (f: string) => void } = {},
) {
  const entityIndex: EntityIndexEntry[] = [
    { id: 'cccc', path: 'notes/npcs/cccc.md', title: 'Mira', type: 'note' },
  ];
  const onOpenById = overrides.onOpenById ?? vi.fn();
  const onOpenEvent = overrides.onOpenEvent ?? vi.fn();
  act(() => {
    root.render(
      <RelationshipsView
        campaignPath="/campaign"
        entityLabelMap={entityLabelMap}
        getEntityIndex={() => entityIndex}
        onOpenById={onOpenById}
        onOpenEvent={onOpenEvent}
      />,
    );
  });
  return { onOpenById, onOpenEvent };
}

/** Finds an `.rel-outer-row` whose label text matches, by its `EntityLink` text. */
function findOuterRow(label: string): HTMLElement {
  const row = Array.from(container.querySelectorAll('.rel-outer-row')).find(
    (el) => el.querySelector('.rel-outer-label')?.textContent === label,
  );
  if (!row) throw new Error(`No outer row for "${label}"`);
  return row as HTMLElement;
}

function findInnerRow(outer: HTMLElement, label: string): HTMLElement {
  const row = Array.from(outer.querySelectorAll('.rel-inner-row')).find(
    (el) => el.querySelector('.rel-inner-label')?.textContent === label,
  );
  if (!row) throw new Error(`No inner row for "${label}"`);
  return row as HTMLElement;
}

function findTrackRow(inner: HTMLElement, trackName: string): HTMLElement {
  const row = Array.from(inner.querySelectorAll('.rel-track-row')).find(
    (el) => el.querySelector('.rel-track-name')?.textContent === trackName,
  );
  if (!row) throw new Error(`No track row for "${trackName}"`);
  return row as HTMLElement;
}

function expandToggle(el: HTMLElement) {
  fireEvent.click(el.querySelector('.rel-expand-toggle')!);
}

function dragHandle(row: HTMLElement): HTMLElement {
  return row.querySelector('.rel-drag-handle') as HTMLElement;
}

/** A minimal DataTransfer stand-in: happy-dom's own is incomplete for our purposes. */
function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type.toLowerCase(), value),
    getData: (type: string) => store.get(type.toLowerCase()) ?? '',
    get types() {
      return Array.from(store.keys());
    },
    dropEffect: 'none',
    effectAllowed: 'none',
  };
}

/**
 * happy-dom's `DragEvent` doesn't extend `MouseEvent` (no `clientY`), so
 * `fireEvent.dragOver(el, { clientY })` silently drops it. Build plain
 * `Event`s instead and attach `dataTransfer`/`clientY` as own properties —
 * our handlers only duck-type on them, same as real drag events.
 */
function makeDragEvent(type: string, dataTransfer: unknown, clientY?: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true });
  if (clientY !== undefined) {
    Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
  }
  return event;
}

/** Drags `source`'s handle onto `target`, landing "before" or "after" it. */
function dragRowOnto(source: HTMLElement, target: HTMLElement, position: 'before' | 'after') {
  const dataTransfer = makeDataTransfer();
  const rect = { top: 100, left: 0, right: 100, bottom: 120, height: 20, width: 100 };
  target.getBoundingClientRect = () => rect as DOMRect;
  const clientY = position === 'before' ? rect.top + 2 : rect.top + rect.height - 2;

  fireEvent(dragHandle(source), makeDragEvent('dragstart', dataTransfer));
  fireEvent(target, makeDragEvent('dragover', dataTransfer, clientY));
  fireEvent(target, makeDragEvent('drop', dataTransfer, clientY));
}

/** The "Group by …" footer button portals into `footerSlot`, not `container`. */
function groupByToggle(): HTMLElement {
  const button = Array.from(footerSlot.querySelectorAll('button')).find((b) =>
    b.textContent?.startsWith('Group by'),
  );
  if (!button) throw new Error('Group by toggle not found');
  return button as HTMLElement;
}

beforeEach(setup);
afterEach(teardown);

describe('RelationshipsView', () => {
  it('renders holders with observers nested; toggling grouping inverts the nesting', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    expect(findInnerRow(zaraOuter, 'Anna')).toBeTruthy(); // bbbb nested under aaaa (holder mode)

    fireEvent.click(groupByToggle());
    await flush();

    const annaOuter = findOuterRow('Anna');
    expandToggle(annaOuter);
    await flush();
    expect(findInnerRow(annaOuter, 'Zara')).toBeTruthy(); // now inverted: aaaa nested under bbbb
  });

  it('the same relationship reads identically in both grouping modes', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    const annaInner = findInnerRow(zaraOuter, 'Anna');
    expandToggle(annaInner);
    await flush();
    const repTrack = findTrackRow(annaInner, 'PF2E Reputation');
    const holderFormatted = repTrack.querySelector('.rel-value-bar-label')?.textContent;
    expect(holderFormatted).toBeTruthy();

    fireEvent.click(groupByToggle());
    await flush();

    const annaOuter = findOuterRow('Anna');
    expandToggle(annaOuter);
    await flush();
    const zaraInner = findInnerRow(annaOuter, 'Zara');
    expandToggle(zaraInner);
    await flush();
    const repTrack2 = findTrackRow(zaraInner, 'PF2E Reputation');
    const observerFormatted = repTrack2.querySelector('.rel-value-bar-label')?.textContent;

    expect(observerFormatted).toBe(holderFormatted);
  });

  it('rows collapse and expand independently', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    const miraOuter = findOuterRow('Mira');

    expandToggle(zaraOuter);
    await flush();
    expect(zaraOuter.querySelector('.rel-inner-list')).toBeTruthy();
    expect(miraOuter.querySelector('.rel-inner-list')).toBeFalsy();

    expandToggle(zaraOuter); // collapse it back
    await flush();
    expect(zaraOuter.querySelector('.rel-inner-list')).toBeFalsy();
  });

  it('steps are only computed and fetched for expanded rows', async () => {
    renderView();
    await flush();
    expect(state.getDirectivesSpy).not.toHaveBeenCalled();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    const annaInner = findInnerRow(zaraOuter, 'Anna');
    expandToggle(annaInner);
    await flush();
    expect(state.getDirectivesSpy).not.toHaveBeenCalled(); // track row itself still collapsed

    const repTrack = findTrackRow(annaInner, 'PF2E Reputation');
    expandToggle(repTrack);
    await flush();

    expect(state.getDirectivesSpy).toHaveBeenCalledWith(['timeline/meeting.md']);
  });

  it('steps show the directive sentence, fade future steps, mark set breaks and mirrored steps', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    const annaInner = findInnerRow(zaraOuter, 'Anna');
    expandToggle(annaInner);
    await flush();
    const repTrack = findTrackRow(annaInner, 'PF2E Reputation');
    expandToggle(repTrack);
    await flush();
    await flush();

    const steps = repTrack.querySelectorAll('.rel-step');
    expect(steps.length).toBe(2);
    expect(steps[0].textContent).toContain('Helped defend the town');
    expect(steps[0].classList.contains('rel-step-future')).toBe(false);
    expect(steps[1].classList.contains('rel-step-future')).toBe(true);
    expect(steps[1].classList.contains('rel-step-set-break')).toBe(true);
    expect(steps[1].textContent).toContain('Meeting at the docks'); // empty reason -> event title

    // Mirrored tag step: in observer mode, the mirror ledger (holder bbbb,
    // observer cccc) inverts to outer=cccc(Mira), inner=bbbb(Anna).
    fireEvent.click(groupByToggle());
    await flush();

    const miraOuter = findOuterRow('Mira');
    expandToggle(miraOuter);
    await flush();
    const annaInner2 = findInnerRow(miraOuter, 'Anna');
    expandToggle(annaInner2);
    await flush();
    const tagTrack = findTrackRow(annaInner2, 'Relationship tags');
    expandToggle(tagTrack);
    await flush();
    await flush();

    expect(tagTrack.textContent).toContain('mirrored from');
    expect(tagTrack.textContent).toContain('Mira');
  });

  it('relationships with only future changes render faded at the initial value', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    const miraInner = findInnerRow(zaraOuter, 'Mira');
    expandToggle(miraInner);
    await flush();
    const attitudeTrack = findTrackRow(miraInner, 'Attitude');

    expect(attitudeTrack.classList.contains('rel-track-only-future')).toBe(true);
    expect(attitudeTrack.textContent).toContain('Indifferent'); // initial rung, not the future 'friendly'
  });

  it('ctrl+click on a holder opens the note; plain click does not', async () => {
    const { onOpenById } = renderView();
    await flush();

    const holderLink = findOuterRow('Zara').querySelector('.rel-outer-label') as HTMLElement;
    fireEvent.click(holderLink);
    expect(onOpenById).not.toHaveBeenCalled();

    fireEvent.click(holderLink, { ctrlKey: true });
    expect(onOpenById).toHaveBeenCalledWith('aaaa');
  });

  it('invalid directives are listed as problems', async () => {
    renderView();
    await flush();

    expect(container.textContent).toContain('Problems');
    expect(container.textContent).toContain('notes/bad.md');
    expect(container.textContent).toContain('Unknown note [[zzzz]]');
  });

  it('reloads when relationships change', async () => {
    renderView();
    await flush();

    expect(state.getAllLedgersSpy).toHaveBeenCalledTimes(1);
    expect(state.onChangedCb).toBeTruthy();

    act(() => {
      state.onChangedCb!({ paths: ['timeline/meeting.md'] });
    });
    await flush();

    expect(state.getAllLedgersSpy).toHaveBeenCalledTimes(2);
  });

  it('no editing affordance is rendered', async () => {
    renderView();
    await flush();

    const zaraOuter = findOuterRow('Zara');
    expandToggle(zaraOuter);
    await flush();
    const annaInner = findInnerRow(zaraOuter, 'Anna');
    expandToggle(annaInner);
    await flush();

    expect(container.querySelectorAll('input, select, textarea').length).toBe(0);
    const buttonLabels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    for (const label of buttonLabels) {
      expect(label).not.toMatch(/save|edit|delete|adjust|set value/i);
    }
  });

  function outerLabels(): (string | null)[] {
    return Array.from(container.querySelectorAll('.rel-outer-label')).map((el) => el.textContent);
  }

  it('a relationship absent from the file still renders', async () => {
    // Holder-mode top level only lists 'cccc' (Mira); aaaa/bbbb are unlisted.
    fsApi.readSpy.mockResolvedValue(
      JSON.stringify({
        version: 1,
        holder: { order: { '': ['cccc'] }, expanded: { outer: [], inner: [], track: [] } },
        observer: { order: {}, expanded: { outer: [], inner: [], track: [] } },
      }),
    );
    renderView();
    await flush();

    // All three holders still render: the listed one first, the rest appended alphabetically.
    expect(outerLabels()).toEqual(['Mira', 'Anna', 'Zara']);
  });

  it('order is stored per grouping mode', async () => {
    renderView();
    await flush();

    // Reorder the two observer-mode outer rows (Anna, Mira).
    fireEvent.click(groupByToggle());
    await flush();
    expect(outerLabels()).toEqual(['Anna', 'Mira']);

    dragRowOnto(findOuterRow('Mira'), findOuterRow('Anna'), 'before');
    await flush();
    expect(outerLabels()).toEqual(['Mira', 'Anna']);

    // Holder mode (3 outer rows: Anna, Mira, Zara) is unaffected.
    fireEvent.click(groupByToggle());
    await flush();
    expect(outerLabels()).toEqual(['Anna', 'Mira', 'Zara']);

    await flushSaveDebounce();
    const [, content] = fsApi.writeSpy.mock.calls.at(-1)!;
    const saved = JSON.parse(content);
    expect(saved.observer.order['']).toEqual(['cccc', 'bbbb']); // Mira, Anna
    expect(saved.holder.order['']).toBeUndefined();
  });

  it('context menu offers move to top/up/down and disables inapplicable items', async () => {
    renderView();
    await flush();

    // Anna is first alphabetically: "move to top"/"move up" are inapplicable.
    fireEvent.contextMenu(findOuterRow('Anna'), { clientX: 5, clientY: 5 });
    expect(state.showContextMenuSpy).toHaveBeenCalledTimes(1);
    const firstItems = state.showContextMenuSpy.mock.calls[0][0] as Array<{
      label: string;
      disabled?: boolean;
      onSelect: () => void;
    }>;
    const firstByLabel = Object.fromEntries(firstItems.map((i) => [i.label, i]));
    expect(firstByLabel['Move to top'].disabled).toBe(true);
    expect(firstByLabel['Move up'].disabled).toBe(true);
    expect(firstByLabel['Move down'].disabled).toBe(false);

    state.showContextMenuSpy.mockClear();

    // Zara is last alphabetically: "move down" is inapplicable.
    fireEvent.contextMenu(findOuterRow('Zara'), { clientX: 5, clientY: 5 });
    const lastItems = state.showContextMenuSpy.mock.calls[0][0] as Array<{
      label: string;
      disabled?: boolean;
      onSelect: () => void;
    }>;
    const lastByLabel = Object.fromEntries(lastItems.map((i) => [i.label, i]));
    expect(lastByLabel['Move down'].disabled).toBe(true);
    expect(lastByLabel['Move to top'].disabled).toBe(false);

    // Selecting an enabled item actually reorders the rows.
    act(() => lastByLabel['Move to top'].onSelect());
    await flush();
    expect(outerLabels()).toEqual(['Zara', 'Anna', 'Mira']);
  });

  it('dragging a row onto the gap before another moves it there and saves', async () => {
    renderView();
    await flush();
    expect(outerLabels()).toEqual(['Anna', 'Mira', 'Zara']);

    dragRowOnto(findOuterRow('Zara'), findOuterRow('Anna'), 'before');
    await flush();
    expect(outerLabels()).toEqual(['Zara', 'Anna', 'Mira']);

    await flushSaveDebounce();
    expect(fsApi.mkdirSpy).toHaveBeenCalledWith('/campaign/relationships');
    const [path, content] = fsApi.writeSpy.mock.calls.at(-1)!;
    expect(path).toBe('/campaign/relationships/view-order.json');
    const saved = JSON.parse(content);
    expect(saved.holder.order['']).toEqual(['aaaa', 'bbbb', 'cccc']); // Zara, Anna, Mira
  });
});
