// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';

import { parseDirectives } from '../../../../shared/relationships';
import type { Ledger, RelationshipDelta } from '../../../../shared/relationships';
import type { InvalidDirectiveEntry } from '../../../../main/relationships-store';
import type { EntityIndexEntry } from '../../../../types/global';

// ---- Hoisted mock state (mutable across a test, read inside the mock factories) ----

const state = vi.hoisted(() => ({
  ledgers: [] as Ledger[],
  invalid: [] as InvalidDirectiveEntry[],
  filesByPath: {} as Record<string, { title?: string; directives: unknown[] }>,
  getDirectivesSpy: vi.fn(),
  getAllLedgersSpy: vi.fn(),
  onChangedCb: null as ((data: { paths: string[] }) => void) | null,
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
}

// ---- Test harness ----

let container: HTMLDivElement;
let root: Root;
let footerSlot: HTMLDivElement;

function setup() {
  resetFixtures();
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
});
