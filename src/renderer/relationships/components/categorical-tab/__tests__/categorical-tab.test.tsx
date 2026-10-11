// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import type { InvalidDirectiveEntry, Ledger } from '../../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../../types/global';
import { CalendarProvider } from '../../../../timeline/calendar/provider';
import { deriveCategoricalTable, type CategoricalGroupBy } from '../../../domain/categorical';
import type { SearchScope } from '../../../domain/search';
import { formatEntryDate } from '../../../domain/entry-date';
import {
  NOW,
  entriesFor,
  holds,
  labelFor,
  ledger,
  mutualPair,
  tagDelta,
  tags,
} from '../../../domain/__tests__/categorical-fixtures';
import { CategoricalTab, type CategoricalTabProps } from '../categorical-tab';

vi.mock('../../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../../shared/context-menu', () => ({ showContextMenu: vi.fn() }));

// ---- Fixtures ----
//
// Zara holds member toward Thieves Guild: gained at 10, lost at 20, gained again at 30.
// Anna holds customer toward Rusty Inn, from an undated note. Mira and Dax are married (mutual).

const onOpenById = vi.fn();
const onOpenEvent = vi.fn();

const TITLES = new Map([['notes/npcs/anna.md', 'Anna the regular']]);
const ENTITY_INDEX: EntityIndexEntry[] = [
  { id: 'n-anna', path: 'notes/npcs/anna.md', title: 'Anna the regular', type: 'note' },
  { id: 'n-zara', path: 'notes/npcs/zara.md', title: 'Zara', type: 'note' },
];

function fixtureLedgers(): Ledger[] {
  return [
    ledger('zara', 'guild', [
      tagDelta('add', 'member', {
        at: 10,
        reason: 'Joined the raid',
        declaredIn: { path: 'timeline/raid.md', ordinal: 0 },
      }),
      tagDelta('remove', 'member', {
        at: 20,
        reason: 'Expelled',
        declaredIn: { path: 'timeline/expelled.md', ordinal: 0 },
      }),
      tagDelta('add', 'member', {
        at: 30,
        reason: 'Readmitted',
        declaredIn: { path: 'notes/npcs/zara.md', ordinal: 0 },
      }),
    ]),
    holds('anna', 'inn', 'customer', { declaredIn: { path: 'notes/npcs/anna.md', ordinal: 0 } }),
    ...mutualPair('mira', 'dax', 'married', {
      at: 5,
      reason: 'Wedding',
      declaredIn: { path: 'timeline/wedding.md', ordinal: 0 },
    }),
  ];
}

const label = (key: string) => tags.optionFor(key)!.label;

function invalidEntry(): InvalidDirectiveEntry {
  return {
    path: 'notes/bad.md',
    trackId: 'tg01',
    ordinal: 0,
    from: 0,
    to: 5,
    messages: ['Bad tag'],
  };
}

interface Setup {
  ledgers?: Ledger[];
  groupBy?: CategoricalGroupBy;
  query?: string;
  emptyMessage?: string | null;
  trackProblems?: InvalidDirectiveEntry[];
  /** Scopes switched off in the toolbar. */
  disabledScopes?: SearchScope[];
}

const ALL_SCOPES: SearchScope[] = ['holder', 'tag', 'observer'];

function props(setup: Setup = {}): CategoricalTabProps {
  const query = setup.query ?? '';
  const disabled = setup.disabledScopes ?? [];
  const scopes = ALL_SCOPES.map((scope) => ({ scope, enabled: !disabled.includes(scope) }));
  return {
    toolbar: <div data-testid="toolbar">toolbar</div>,
    track: tags,
    view: deriveCategoricalTable(entriesFor(setup.ledgers ?? fixtureLedgers(), TITLES), {
      track: tags,
      groupBy: setup.groupBy ?? 'holder',
      query,
      enabledScopes: scopes.filter((s) => s.enabled).map((s) => s.scope),
      labelFor,
    }),
    query,
    scopes,
    emptyMessage: setup.emptyMessage ?? null,
    trackProblems: setup.trackProblems ?? [],
    now: NOW,
    titleByPath: TITLES,
    labelFor,
    entityIndex: ENTITY_INDEX,
    onOpenById,
    onOpenEvent,
  };
}

// ---- Harness ----

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  CalendarProvider._reset();
  onOpenById.mockClear();
  onOpenEvent.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(setup: Setup = {}) {
  act(() => root.render(<CategoricalTab {...props(setup)} />));
}

const $ = (sel: string, scope: ParentNode = container) => scope.querySelector<HTMLElement>(sel)!;
const $$ = (sel: string, scope: ParentNode = container) =>
  Array.from(scope.querySelectorAll<HTMLElement>(sel));
const text = (els: HTMLElement[]) => els.map((e) => e.textContent);
const click = (el: HTMLElement) => act(() => void fireEvent.click(el));

const sections = () => $$('.rel-cat-section');
const rows = () => $$('.rel-cat-row');
const sectionTitles = () => sections().map((s) => s.textContent?.replace(/^[▸▾]/, ''));

function rowFor(holder: string, observer?: string): HTMLElement {
  const row = rows().find(
    (r) =>
      $('.rel-cat-holder', r).textContent === holder &&
      (observer === undefined || $('.rel-cat-observer', r).textContent === observer),
  );
  if (!row) throw new Error(`no row ${holder}`);
  return row;
}

const chevronOf = (row: HTMLElement) => $('button.rel-cat-chevron', row);
const historyLines = () => $$('.rel-cat-entry');

describe('CategoricalTab', () => {
  it('the column headers read Holder, Tag, Observer, Reason in both groupings', () => {
    for (const groupBy of ['holder', 'tag'] as const) {
      render({ groupBy });
      expect(text($$('.rel-cat-columns > span'))).toEqual([
        '',
        'Holder',
        'Tag',
        '',
        'Observer',
        'Reason',
      ]);
    }
  });

  it('by holder, section rows show the holder name and count; by tag, the chip, mutual and count', () => {
    render();
    expect(sectionTitles()).toEqual(['Anna1', 'Dax1', 'Mira1', 'Zara1']);
    expect($('.rel-cat-holder', sections()[0]).textContent).toBe('Anna');
    expect($('.rel-cat-count', sections()[0]).textContent).toBe('1');

    render({ groupBy: 'tag' });
    expect(sectionTitles()).toEqual([
      `${label('member')}1`,
      `${label('customer')}1`,
      `${label('married')}mutual1`,
    ]);
    expect($('.rel-tag-chip', sections()[0]).textContent).toBe(label('member'));
    expect($('.rel-cat-mutual', sections()[0])).toBeNull();
    expect($('.rel-cat-mutual', sections()[2]).textContent).toBe('mutual');
  });

  it('clicking a section row folds and unfolds its rows', () => {
    render();
    const zara = sections()[3];
    expect(zara.getAttribute('aria-expanded')).toBe('true');
    expect(rows()).toHaveLength(4);

    click(zara);
    expect(sections()[3].getAttribute('aria-expanded')).toBe('false');
    expect(rows().map((r) => $('.rel-cat-holder', r).textContent)).toEqual(['Anna', 'Dax', 'Mira']);

    click(sections()[3]);
    expect(sections()[3].getAttribute('aria-expanded')).toBe('true');
    expect(rows()).toHaveLength(4);
  });

  it('a result row shows holder · chip · → · observer · reason, with ⇄ for mutual', () => {
    render();
    const zara = rowFor('Zara');
    expect(text(cells(zara))).toEqual([
      'Zara',
      label('member'),
      '→',
      'Thieves Guild',
      'Readmitted',
    ]);
    expect($('.rel-cat-verb', rowFor('Mira')).textContent).toBe('⇄');
    expect($('.rel-cat-verb', rowFor('Dax')).textContent).toBe('⇄');
  });

  it('clicking the chevron or the row expands its history; a second click collapses it', () => {
    render();
    expect(historyLines()).toHaveLength(0);

    click(chevronOf(rowFor('Zara')));
    expect(historyLines()).toHaveLength(3);
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-expanded')).toBe('true');

    click(rowFor('Zara'));
    expect(historyLines()).toHaveLength(0);

    click(rowFor('Zara'));
    expect(historyLines()).toHaveLength(3);
    click(chevronOf(rowFor('Zara')));
    expect(historyLines()).toHaveLength(0);
  });

  it('opening another row closes the first', () => {
    render();
    click(rowFor('Zara'));
    expect(historyLines()).toHaveLength(3);

    click(rowFor('Anna'));
    expect(historyLines()).toHaveLength(1);
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-expanded')).toBe('false');
    expect(chevronOf(rowFor('Anna')).getAttribute('aria-expanded')).toBe('true');
    expect(
      $$('.rel-cat-chevron[aria-expanded="true"]', container).filter((c) =>
        c.closest('.rel-cat-row'),
      ),
    ).toHaveLength(1);
  });

  it('clicking a holder or observer name opens the note and does not toggle the row', () => {
    render();
    const zara = rowFor('Zara');
    click($('.rel-entity-link', $('.rel-cat-holder', zara)));
    expect(onOpenById).toHaveBeenLastCalledWith('zara');
    click($('.rel-entity-link', $('.rel-cat-observer', zara)));
    expect(onOpenById).toHaveBeenLastCalledWith('guild');
    expect(historyLines()).toHaveLength(0);
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-expanded')).toBe('false');
  });

  it('history lines show date, coloured gained/lost, and a reason link that opens the event or note', () => {
    render();
    click(rowFor('Zara'));
    const lines = historyLines();
    expect(lines.map((l) => $('.rel-cat-entry-change', l).textContent)).toEqual([
      'gained',
      'lost',
      'gained',
    ]);
    expect($('.rel-cat-entry-change', lines[0]).classList.contains('is-gained')).toBe(true);
    expect($('.rel-cat-entry-change', lines[1]).classList.contains('is-lost')).toBe(true);
    expect(lines.map((l) => $('.rel-cat-entry-date', l).textContent)).toEqual([
      formatEntryDate(30, { narrow: false }),
      formatEntryDate(20, { narrow: false }),
      formatEntryDate(10, { narrow: false }),
    ]);
    expect(lines.map((l) => $('.rel-cat-entry-link', l).textContent)).toEqual([
      'Readmitted',
      'Expelled',
      'Joined the raid',
    ]);

    click($('.rel-cat-entry-link', lines[2]));
    expect(onOpenEvent).toHaveBeenLastCalledWith('raid.md');
    click($('.rel-cat-entry-link', lines[0]));
    expect(onOpenById).toHaveBeenLastCalledWith('n-zara');
    expect(historyLines()).toHaveLength(3);
  });

  it("an undated baseline's history link is labelled and opens by the note's title", () => {
    render();
    click(rowFor('Anna'));
    const [line] = historyLines();
    expect($('.rel-cat-entry-date', line).textContent).toBe(
      formatEntryDate(null, { narrow: false }),
    );
    expect($('.rel-cat-entry-change', line).textContent).toBe('gained');
    const link = $('.rel-cat-entry-link', line);
    expect(link.textContent).toBe('Anna the regular');
    click(link);
    expect(onOpenById).toHaveBeenLastCalledWith('n-anna');
  });

  it('the chevron button is keyboard-operable and reports aria-expanded', () => {
    render();
    const chevron = chevronOf(rowFor('Zara'));
    expect(chevron.tagName).toBe('BUTTON');
    expect(chevron.getAttribute('type')).toBe('button');
    expect(chevron.getAttribute('aria-label')).toContain('Zara');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(chevron.tabIndex).toBe(0);

    // A native button turns Enter and Space into a click, which the row handles.
    click(chevron);
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-expanded')).toBe('true');
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-label')).toMatch(/^Hide/);
    expect(sections()[0].tagName).toBe('BUTTON');
  });

  it('search highlights matches in holder, tag and observer cells and hides empty sections', () => {
    render({ query: 'zara' });
    expect(sectionTitles()).toEqual(['Zara1']);
    expect($$('mark.rel-match', rowFor('Zara')).map((m) => m.textContent)).toEqual(['Zara']);
    expect($('.rel-cat-holder mark', rowFor('Zara'))).not.toBeNull();

    render({ query: 'thieves' });
    expect($('.rel-cat-observer mark', rowFor('Zara')).textContent).toBe('Thieves');

    render({ query: 'member' });
    expect($('.rel-cat-tag mark', rowFor('Zara')).textContent).toBe('member');
    expect(sectionTitles()).toEqual(['Zara1']);
  });

  it('the empty-track and no-match notices render, and track problems render', () => {
    render({ ledgers: [] });
    expect($('.rel-empty').textContent).toContain('No Relationship tags changes yet.');
    expect($('.rel-cat-table')).toBeNull();

    render({ query: 'zzz', emptyMessage: 'Nothing matches "zzz".' });
    expect($('.rel-empty').textContent).toBe('Nothing matches "zzz".');
    expect(sections()).toHaveLength(0);

    render({ trackProblems: [invalidEntry()] });
    expect($('.rel-track-problems').textContent).toContain('Bad tag');
    expect($('[data-testid="toolbar"]')).not.toBeNull();
  });

  it('closes the open row when the grouping changes', () => {
    render();
    click(rowFor('Zara'));
    expect(historyLines()).toHaveLength(3);
    render({ groupBy: 'tag' });
    expect(historyLines()).toHaveLength(0);
  });

  it('stays closed when the grouping is switched away and back', () => {
    render();
    click(rowFor('Zara'));
    render({ groupBy: 'tag' });
    render();
    expect(historyLines()).toHaveLength(0);
    expect(chevronOf(rowFor('Zara')).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the open row when the query changes, and keeps it closed when the query is cleared', () => {
    render();
    click(rowFor('Zara'));
    render({ query: 'zara' });
    expect(historyLines()).toHaveLength(0);
    render();
    expect(historyLines()).toHaveLength(0);
  });

  it('keeps sections folded across a grouping switch', () => {
    render();
    click(sections()[3]);
    render({ groupBy: 'tag' });
    render();
    expect(sections()[3].getAttribute('aria-expanded')).toBe('false');
  });

  it('marks a mirrored history entry with the side it was mirrored from', () => {
    render();
    click(rowFor('Dax'));
    const mirror = $('.rel-cat-entry-mirror');
    expect(mirror.textContent).toBe("(mirrored from Mira's side)");
    click(rowFor('Dax'));
    click(rowFor('Mira'));
    expect($('.rel-cat-entry-mirror')).toBeNull();
  });

  it('highlights a query only in the cells whose scope is enabled', () => {
    render({ query: 'zara', disabledScopes: ['holder'] });
    expect(rows()).toHaveLength(0);

    render({ query: 'guild', disabledScopes: ['holder'] });
    expect($('.rel-cat-observer mark', rowFor('Zara'))).not.toBeNull();
    expect($('.rel-cat-holder mark', rowFor('Zara'))).toBeNull();
  });
});

/** The text of a row's cells after its chevron. */
function cells(row: HTMLElement): HTMLElement[] {
  return Array.from(row.children).slice(1) as HTMLElement[];
}
