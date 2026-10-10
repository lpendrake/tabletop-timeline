// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import type { Ledger } from '../../../../../shared/relationships';
import {
  deriveCategoricalView,
  type CategoricalGroupBy,
  type CategoricalView,
} from '../../../domain/categorical';
import type { SearchScope } from '../../../domain/search';
import { entityCardsKey } from '../../../domain/view-order';
import {
  NOW,
  entriesFor,
  holds,
  labelFor,
  mutualPair,
  tagDelta,
  tags,
  viewOrder,
} from '../../../domain/__tests__/categorical-fixtures';
import { Toolbar, type ToolbarProps } from '../../toolbar';
import { CategoricalTab, type CategoricalTabProps } from '../categorical-tab';
import { GroupBySwitch } from '../group-by-switch';

const showContextMenu = vi.hoisted(() => vi.fn());
const setGroupBy = vi.fn();

vi.mock('../../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../../shared/context-menu', () => ({ showContextMenu }));

const SCOPES: SearchScope[] = ['name', 'group', 'tag'];

/** Member: Zara and Anna at the guild, Mira at the inn; Dax is a customer; Zara and Anna are married. */
function sample(): Ledger[] {
  return [
    holds('zara', 'guild', 'member'),
    holds('anna', 'guild', 'member'),
    holds('mira', 'inn', 'member'),
    holds('dax', 'inn', 'customer'),
    ...mutualPair('zara', 'anna', 'married'),
  ];
}

interface Setup {
  groupBy?: CategoricalGroupBy;
  query?: string;
  emptyMessage?: string | null;
}

function deriveView(ledgers: Ledger[], setup: Setup = {}): CategoricalView {
  return deriveCategoricalView(entriesFor(ledgers), {
    track: tags,
    trackId: tags.id,
    groupBy: setup.groupBy ?? 'tag',
    query: setup.query ?? '',
    enabledScopes: SCOPES,
    viewOrder: viewOrder(),
    labelFor,
  });
}

function props(ledgers: Ledger[], setup: Setup = {}): CategoricalTabProps {
  const query = setup.query ?? '';
  const view = deriveView(ledgers, setup);
  const toolbarProps: ToolbarProps = {
    holderPicker: {
      show: false,
      label: 'Holder',
      allLabel: 'All holders',
      holders: [],
      pinned: [],
      selectedId: '*',
      selectedCount: 0,
    },
    selectHolder: vi.fn(),
    labelFor,
    scopes: [
      { scope: 'name', label: 'Name', enabled: true },
      { scope: 'group', label: 'Group', enabled: true },
      { scope: 'tag', label: 'Tag', enabled: true },
    ],
    toggleScope: vi.fn(),
    query,
    setQuery: vi.fn(),
    countLabel: null,
    sortModes: [],
    sortMode: 'mine',
    setSortMode: vi.fn(),
  };
  return {
    // Rendered the way the relationships view composes it.
    toolbar: (
      <Toolbar {...toolbarProps}>
        <GroupBySwitch groupBy={view.groupBy} onChange={setGroupBy} />
        <span className="rel-cat-hint">Click a name for its history and source</span>
      </Toolbar>
    ),
    track: tags,
    view,
    query,
    labelFor,
    emptyMessage: setup.emptyMessage ?? null,
    trackProblems: [],
    now: NOW,
    titleByPath: new Map(),
    entityIndex: [],
    moveRow: vi.fn(),
    onOpenById: vi.fn(),
    onOpenEvent: vi.fn(),
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  showContextMenu.mockClear();
  setGroupBy.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(p: CategoricalTabProps) {
  act(() => root.render(<CategoricalTab {...p} />));
}

const $ = (sel: string, from: ParentNode = container) => from.querySelector(sel) as HTMLElement;
const $$ = (sel: string, from: ParentNode = container) =>
  Array.from(from.querySelectorAll(sel)) as HTMLElement[];
const cards = () => $$('.rel-cat-card');
const names = (from: ParentNode = container) => $$('.rel-cat-name', from).map((n) => n.textContent);

function nameButton(label: string, from: ParentNode = container): HTMLElement {
  const found = $$('.rel-cat-name', from).find((n) => n.textContent === label);
  if (!found) throw new Error(`no name ${label}`);
  return found;
}

function click(el: HTMLElement) {
  act(() => {
    fireEvent.click(el);
  });
}

function cardWith(title: string): HTMLElement {
  const found = cards().find((c) => $('.rel-cat-card-header', c).textContent?.includes(title));
  if (!found) throw new Error(`no card ${title}`);
  return found;
}

/** `count` members of the guild, p01 to pNN. */
function manyMembers(count: number): Ledger[] {
  return Array.from({ length: count }, (_, i) =>
    holds(`p${String(i + 1).padStart(2, '0')}`, 'guild', 'member'),
  );
}

/** `count` married couples, m1 ⇄ n1 and so on. */
function manyCouples(count: number): Ledger[] {
  return Array.from({ length: count }, (_, i) =>
    mutualPair(`m${i + 1}`, `n${i + 1}`, 'married'),
  ).flat();
}

describe('CategoricalTab', () => {
  it('toolbar shows Name · Group · Tag, the Group by switch and the hint, with no sort control', () => {
    const p = props(sample());
    render(p);
    expect($$('.rel-scope').map((s) => s.textContent)).toEqual(['Name', 'Group', 'Tag']);
    const buttons = $$('.rel-groupby button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Tag', 'Entity']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect($('.rel-cat-hint').textContent).toBe('Click a name for its history and source');
    expect($('.rel-cat-hint').textContent).not.toContain('↺');
    expect($('[aria-label="Sort"]')).toBeNull();
    expect($('.rel-holder-picker')).toBeNull();

    click(buttons[1]);
    expect(setGroupBy).toHaveBeenCalledWith('entity');
    const group = $('.rel-groupby [role="group"]');
    expect(group.getAttribute('aria-labelledby')).toBe($('.rel-groupby-caption').id);
    expect(group.hasAttribute('aria-label')).toBe(false);
  });

  it('by-tag and by-entity render the same card component', () => {
    render(props(sample()));
    const byTag = cards();
    expect(byTag.length).toBeGreaterThan(0);
    render(props(sample(), { groupBy: 'entity' }));
    const byEntity = cards();
    expect(byEntity.length).toBeGreaterThan(0);
    for (const card of [...byTag, ...byEntity]) {
      expect(card.tagName).toBe('SECTION');
      expect(card.className.trim()).toBe('rel-cat-card');
      expect($('.rel-cat-card-header > .rel-cat-count', card)).not.toBeNull();
    }
  });

  it('by-tag card header shows chip, "mutual" and count', () => {
    render(props(sample()));
    const member = cardWith('member');
    expect($('.rel-cat-card-header .rel-tag-chip', member).textContent).toBe('member');
    expect($('.rel-cat-card-header .rel-cat-muted', member)).toBeNull();
    expect($('.rel-cat-card-header .rel-cat-count', member).textContent).toBe('3');

    const married = cardWith('married');
    expect($('.rel-cat-card-header .rel-cat-muted', married).textContent).toBe('mutual');
    expect($('.rel-cat-card-header .rel-cat-count', married).textContent).toBe('1');
  });

  it('by-tag rows show the observer, its count and the holder names', () => {
    render(props(sample()));
    const rows = $$('.rel-cat-row', cardWith('member'));
    expect(rows.map((r) => $('.rel-cat-observer', r).textContent)).toEqual([
      'Rusty Inn',
      'Thieves Guild',
    ]);
    expect(rows.map((r) => $('.rel-cat-row-label .rel-cat-count', r).textContent)).toEqual([
      '1',
      '2',
    ]);
    expect(names(rows[1])).toEqual(['Anna', 'Zara']);
  });

  it('by-entity card header shows handle, gold observer and count', () => {
    render(props(sample(), { groupBy: 'entity' }));
    const guild = cardWith('Thieves Guild');
    const header = $('.rel-cat-card-header', guild);
    expect($('.rel-drag-handle', header)).not.toBeNull();
    expect($('.rel-cat-entity', header).textContent).toBe('Thieves Guild');
    expect($('.rel-cat-count', header).textContent).toBe('2');
    const row = $('.rel-cat-row', guild);
    expect($('.rel-tag-chip', row).textContent).toBe('member');
    expect($('.rel-cat-row-label .rel-cat-count', row).textContent).toBe('2');
    expect(names(row)).toEqual(['Anna', 'Zara']);
  });

  it('a mutual pair renders once as "A ⇄ B"', () => {
    render(props(sample()));
    const pairs = $$('.rel-cat-pair', cardWith('married'));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].textContent).toBe('Anna⇄Zara');
    expect(names(pairs[0])).toEqual(['Anna', 'Zara']);
  });

  it('by-entity mutual entries are prefixed ⇄', () => {
    render(props(sample(), { groupBy: 'entity' }));
    const anna = cardWith('Anna');
    const item = $('.rel-cat-item', anna);
    expect(item.textContent).toBe('⇄Zara');
    const guild = cardWith('Thieves Guild');
    expect($$('.rel-cat-mutual-mark', guild)).toHaveLength(0);
  });

  it('"+N more" expands the list and becomes "show less"', () => {
    render(props(manyMembers(12)));
    expect(names()).toHaveLength(10);
    expect($('.rel-cat-more').textContent).toBe('+2 more');

    click($('.rel-cat-more'));
    expect(names()).toHaveLength(12);
    expect($('.rel-cat-more').textContent).toBe('show less');

    click($('.rel-cat-more'));
    expect(names()).toHaveLength(10);
    expect($('.rel-cat-more').textContent).toBe('+2 more');
  });

  it('a mutual list truncates at 6', () => {
    render(props(manyCouples(8)));
    expect($$('.rel-cat-pair')).toHaveLength(6);
    expect($('.rel-cat-more').textContent).toBe('+2 more');
    click($('.rel-cat-more'));
    expect($$('.rel-cat-pair')).toHaveLength(8);
  });

  it('nothing truncates while searching', () => {
    render(props(manyMembers(12), { query: 'p' }));
    expect(names()).toHaveLength(12);
    expect($('.rel-cat-more')).toBeNull();
  });

  it('clicking a name opens the popover and highlights the name', () => {
    render(props(sample()));
    expect($('.rel-tag-popover')).toBeNull();
    const zara = nameButton('Zara', cardWith('member'));
    click(zara);
    const popover = $('.rel-tag-popover');
    expect(popover).not.toBeNull();
    expect($('.rel-tag-popover-header', popover).textContent).toContain('Zara');
    expect($('.rel-tag-popover-header', popover).textContent).toContain('Thieves Guild');
    expect(zara.classList.contains('is-open')).toBe(true);
    expect(nameButton('Anna', cardWith('member')).classList.contains('is-open')).toBe(false);
  });

  it('clicking the same name again closes the popover', () => {
    render(props(sample()));
    const zara = nameButton('Zara', cardWith('member'));
    click(zara);
    click(zara);
    expect($('.rel-tag-popover')).toBeNull();
    expect(zara.classList.contains('is-open')).toBe(false);
  });

  it('clicking another name moves the popover there', () => {
    render(props(sample()));
    const member = cardWith('member');
    click(nameButton('Zara', member));
    click(nameButton('Anna', member));
    expect($$('.rel-tag-popover')).toHaveLength(1);
    expect($('.rel-tag-popover-header').textContent).toContain('Anna');
    expect($$('.rel-cat-name.is-open')).toHaveLength(1);
    expect(nameButton('Anna', member).classList.contains('is-open')).toBe(true);
  });

  it('both sides of a mutual pair open their own direction', () => {
    render(props(sample()));
    click(nameButton('Zara', cardWith('married')));
    expect($('.rel-tag-popover-header').textContent).toContain('⇄');
    expect($('.rel-tag-popover-header').textContent).toContain('Zara');
  });

  it('the popover closes when the query or grouping changes', () => {
    render(props(sample()));
    click(nameButton('Zara', cardWith('member')));
    expect($('.rel-tag-popover')).not.toBeNull();
    render(props(sample(), { query: 'zara' }));
    expect($('.rel-tag-popover')).toBeNull();

    render(props(sample()));
    expect($('.rel-tag-popover')).toBeNull();

    click(nameButton('Zara', cardWith('member')));
    expect($('.rel-tag-popover')).not.toBeNull();
    render(props(sample(), { groupBy: 'entity' }));
    expect($('.rel-tag-popover')).toBeNull();
  });

  it('clicking another name with a real mousedown then click still moves the popover', () => {
    render(props(sample()));
    const member = cardWith('member');
    click(nameButton('Zara', member));
    const anna = nameButton('Anna', member);
    act(() => {
      fireEvent.mouseDown(anna);
    });
    click(anna);
    expect($$('.rel-tag-popover')).toHaveLength(1);
    expect($('.rel-tag-popover-header').textContent).toContain('Anna');
  });

  it('the popover closes when its list collapses', () => {
    render(props(manyMembers(12)));
    click($('.rel-cat-more'));
    click(nameButton('p12'));
    expect($('.rel-tag-popover')).not.toBeNull();
    click($('.rel-cat-more'));
    expect(names()).toHaveLength(10);
    expect($('.rel-tag-popover')).toBeNull();
    click($('.rel-cat-more'));
    expect($('.rel-tag-popover')).toBeNull();
  });

  it('the popover closes when a reload pushes its name past the limit', () => {
    render(props(manyMembers(10)));
    click(nameButton('p10'));
    expect($('.rel-tag-popover')).not.toBeNull();
    render(props([holds('p00', 'guild', 'member'), ...manyMembers(10)]));
    expect(names()).not.toContain('p10');
    expect($('.rel-tag-popover')).toBeNull();
  });

  it('the popover history refreshes when the data changes', () => {
    render(props(sample()));
    click(nameButton('Zara', cardWith('member')));
    const before = $$('.rel-tag-popover-entry').length;
    const changed = sample().map((l) =>
      l.holder === 'zara' && l.observer === 'guild'
        ? { ...l, deltas: [...l.deltas, tagDelta('remove', 'member'), tagDelta('add', 'member')] }
        : l,
    );
    render(props(changed));
    expect($('.rel-tag-popover')).not.toBeNull();
    expect($$('.rel-tag-popover-entry').length).toBeGreaterThan(before);
  });

  it('the popover closes when its entry leaves the view', () => {
    render(props(sample()));
    click(nameButton('Zara', cardWith('member')));
    render(props(sample().filter((l) => l.holder !== 'zara')));
    expect($('.rel-tag-popover')).toBeNull();
  });

  it('matches are highlighted in names and group labels', () => {
    render(props(sample(), { query: 'zar' }));
    expect($$('.rel-cat-name mark').map((m) => m.textContent)).toEqual(['Zar', 'Zar']);

    render(props(sample(), { query: 'guild' }));
    expect($$('.rel-cat-observer mark').map((m) => m.textContent)).toEqual(['Guild']);

    render(props(sample(), { query: 'guild', groupBy: 'entity' }));
    expect($$('.rel-cat-entity mark').map((m) => m.textContent)).toEqual(['Guild']);
  });

  it('cards with no matches are hidden', () => {
    render(props(sample(), { query: 'dax' }));
    expect(cards()).toHaveLength(1);
    expect($('.rel-cat-card-header', cards()[0]).textContent).toContain('customer');
  });

  it('drag handles show only by entity with an empty search', () => {
    render(props(sample()));
    expect($$('.rel-drag-handle')).toHaveLength(0);

    render(props(sample(), { groupBy: 'entity' }));
    expect($$('.rel-drag-handle')).toHaveLength(cards().length);

    render(props(sample(), { groupBy: 'entity', query: 'a' }));
    expect(cards().length).toBeGreaterThan(0);
    expect($$('.rel-drag-handle')).toHaveLength(0);
  });

  it('the context-menu move reorders entity cards', () => {
    const p = props(sample(), { groupBy: 'entity' });
    render(p);
    const order = p.view.cards.map((c) => c.id);
    expect(p.view.listKey).toBe(entityCardsKey(tags.id));

    act(() => {
      fireEvent.contextMenu(cards()[1]);
    });
    expect(showContextMenu).toHaveBeenCalledTimes(1);
    const items = showContextMenu.mock.calls[0][0] as Array<{
      label: string;
      disabled?: boolean;
      onSelect: () => void;
    }>;
    expect(items.map((i) => i.label)).toEqual(['Move to top', 'Move up', 'Move down']);
    expect(items.map((i) => i.disabled)).toEqual([false, false, false]);
    items[2].onSelect();
    expect(p.moveRow).toHaveBeenCalledWith(entityCardsKey(tags.id), order[1], 'down');

    showContextMenu.mockClear();
    act(() => {
      fireEvent.contextMenu(cards()[0]);
    });
    const first = showContextMenu.mock.calls[0][0] as Array<{ disabled?: boolean }>;
    expect(first.map((i) => i.disabled)).toEqual([true, true, false]);

    showContextMenu.mockClear();
    act(() => {
      fireEvent.contextMenu(cards()[cards().length - 1]);
    });
    const last = showContextMenu.mock.calls[0][0] as Array<{ disabled?: boolean }>;
    expect(last.map((i) => i.disabled)).toEqual([false, false, true]);
  });

  it('cards cannot be moved by entity while searching', () => {
    render(props(sample(), { groupBy: 'entity', query: 'a' }));
    act(() => {
      fireEvent.contextMenu(cards()[0]);
    });
    expect(showContextMenu).not.toHaveBeenCalled();
  });

  it('a drop on a card moves the dragged card by the entity-cards key', () => {
    const p = props(sample(), { groupBy: 'entity' });
    render(p);
    const [first, second] = p.view.cards.map((c) => c.id);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      types: [] as string[],
      effectAllowed: '',
      dropEffect: '',
    };
    act(() => {
      fireEvent.dragStart($('.rel-drag-handle', cards()[1]), { dataTransfer });
    });
    act(() => {
      fireEvent.dragOver(cards()[0], { dataTransfer, clientY: 0 });
      fireEvent.drop(cards()[0], { dataTransfer, clientY: 0 });
    });
    expect(p.moveRow).toHaveBeenCalledTimes(1);
    const [key, id] = (p.moveRow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(key).toBe(entityCardsKey(tags.id));
    expect(id).toBe(second);
    expect(second).not.toBe(first);
  });

  it('cards cannot be moved by tag', () => {
    render(props(sample()));
    act(() => {
      fireEvent.contextMenu(cards()[0]);
    });
    expect(showContextMenu).not.toHaveBeenCalled();
  });

  it('the empty-track and no-match notices render', () => {
    render(props([]));
    expect($('.rel-empty code').textContent).toBe('/');
    expect(cards()).toHaveLength(0);

    render(props(sample(), { query: 'zzz', emptyMessage: 'Nothing matches "zzz"' }));
    expect($('.rel-empty').textContent).toBe('Nothing matches "zzz"');
    expect($('.rel-empty code')).toBeNull();
  });

  it('track problems render', () => {
    const p = props(sample());
    p.trackProblems = [
      { path: 'notes/bad.md', trackId: tags.id, ordinal: 0, from: 0, to: 5, messages: ['Bad tag'] },
    ];
    render(p);
    expect($('.rel-problems-title').textContent).toBe('Problems in this track');
    expect($('.rel-problems').textContent).toContain('notes/bad.md');
  });
});
