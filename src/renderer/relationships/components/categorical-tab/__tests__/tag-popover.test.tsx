// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { fireEvent } from '@testing-library/react';
import type { EntityIndexEntry } from '../../../../../types/global';
import type { OptionChip } from '../../../domain/categorical';
import type { TagHistory, TagHistoryEntry } from '../../../domain/categorical-history';
import { openFromWikiLink } from '../../../../peek/stack';
import { computeCaretPlacement } from '../../../../shared/context-menu/caret-position';
import { TagPopover } from '../tag-popover';

vi.mock('../../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../../shared/context-menu/caret-position', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../shared/context-menu/caret-position')>();
  return { ...actual, computeCaretPlacement: vi.fn(actual.computeCaretPlacement) };
});

const chip: OptionChip = { key: 'member', label: 'Member', colour: 'var(--theme-accent-gold)' };

const entry = (over: Partial<TagHistoryEntry> = {}): TagHistoryEntry => ({
  key: 'e1',
  at: 100,
  dateLabel: '3 Lamashan 4725',
  change: 'gained',
  title: 'The Heist',
  declaredPath: 'timeline/heist.md',
  linkLabel: 'The Heist',
  reason: 'Joined after the job',
  mirroredFrom: null,
  ...over,
});

const history = (entries: TagHistoryEntry[] = [entry()]): TagHistory => ({
  status: { kind: 'held', since: 100, changes: entries.length },
  statusText: 'Held since 3 Lamashan 4725',
  entries,
});

const entityIndex: EntityIndexEntry[] = [
  { id: 'npc-1', path: 'notes/npcs/bob.md', title: 'Bob', type: 'note' },
];

let container: HTMLDivElement;
let root: Root;
let anchor: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  anchor = document.createElement('button');
  anchor.textContent = 'Zara';
  document.body.appendChild(anchor);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  anchor.remove();
  vi.clearAllMocks();
});

interface Overrides {
  history?: TagHistory;
  mutual?: boolean;
  onClose?: () => void;
  onOpenById?: (id: string) => void;
  onOpenEvent?: (filename: string) => void;
}

function Popover(o: Overrides) {
  return (
    <TagPopover
      anchor={anchor}
      history={o.history ?? history()}
      holderId="zara"
      holderLabel="Zara"
      observerId="guild"
      observerLabel="Thieves Guild"
      chip={chip}
      mutual={o.mutual ?? false}
      onClose={o.onClose ?? vi.fn()}
      onOpenById={o.onOpenById ?? vi.fn()}
      onOpenEvent={o.onOpenEvent ?? vi.fn()}
      entityIndex={entityIndex}
    />
  );
}

function render(o: Overrides = {}) {
  act(() => root.render(<Popover {...o} />));
}

/** The parent's role: it owns open/closed and unmounts the popover on close. */
function renderControlled() {
  function Host() {
    const [open, setOpen] = useState(true);
    return open ? <Popover onClose={() => setOpen(false)} /> : null;
  }
  act(() => root.render(<Host />));
}

const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');
const header = () => container.querySelector('.rel-tag-popover-header')!;
const row = () => container.querySelector('.rel-tag-popover-entry')!;
const rowTitle = (r: Element = row()) =>
  r.querySelector<HTMLButtonElement>('.rel-tag-popover-title')!;

describe('TagPopover', () => {
  it('header shows holder · chip · of · observer · ×', () => {
    render();
    expect(header().textContent).toBe('ZaraMemberofThieves Guild×');
  });

  it('header shows ⇄ instead of "of" for a mutual option', () => {
    render({ mutual: true });
    expect(header().textContent).toBe('ZaraMember⇄Thieves Guild×');
  });

  it('header names open their notes', () => {
    const onOpenById = vi.fn();
    render({ onOpenById });
    const links = Array.from(header().querySelectorAll<HTMLElement>('.rel-entity-link'));
    expect(links.map((l) => l.textContent)).toEqual(['Zara', 'Thieves Guild']);
    fireEvent.mouseEnter(links[0]);
    expect(openFromWikiLink).toHaveBeenCalledWith('zara', links[0]);
    fireEvent.click(links[0]);
    fireEvent.click(links[1]);
    expect(onOpenById.mock.calls).toEqual([['zara'], ['guild']]);
  });

  it('shows the status line', () => {
    render();
    expect(container.querySelector('.rel-tag-popover-status')!.textContent).toBe(
      'Held since 3 Lamashan 4725',
    );
  });

  it('history rows show date, change, title link and muted reason', () => {
    render();
    expect(row().querySelector('.rel-tag-popover-date')!.textContent).toBe('3 Lamashan 4725');
    expect(row().querySelector('.rel-tag-popover-change')!.textContent).toBe('gained');
    expect(rowTitle().textContent).toBe('The Heist');
    expect(row().querySelector('.rel-tag-popover-reason')!.textContent).toBe(
      'Joined after the job',
    );
  });

  it('omits the reason when there is none', () => {
    render({ history: history([entry({ reason: null })]) });
    expect(row().querySelector('.rel-tag-popover-reason')).toBeNull();
  });

  it('gained uses the positive tone, lost the negative', () => {
    render({ history: history([entry({ key: 'a', change: 'lost' }), entry({ key: 'b' })]) });
    const [lost, gained] = Array.from(container.querySelectorAll('.rel-tag-popover-change'));
    expect(lost.className).toContain('rel-tag-popover-change--lost');
    expect(gained.className).toContain('rel-tag-popover-change--gained');
  });

  it('an event title link opens the event', () => {
    const onOpenEvent = vi.fn();
    render({ onOpenEvent });
    fireEvent.click(rowTitle());
    expect(onOpenEvent).toHaveBeenCalledWith('heist.md');
  });

  it("an undated baseline links to its note by the note's title", () => {
    const onOpenById = vi.fn();
    render({
      onOpenById,
      history: history([
        entry({
          at: null,
          dateLabel: 'Baseline',
          title: 'Bob',
          linkLabel: 'Bob',
          declaredPath: 'notes/npcs/bob.md',
        }),
      ]),
    });
    expect(rowTitle().textContent).toBe('Bob');
    fireEvent.click(rowTitle());
    expect(onOpenById).toHaveBeenCalledWith('npc-1');
  });

  it("renders the entry's link label", () => {
    render({ history: history([entry({ title: null, linkLabel: 'heist.md' })]) });
    expect(rowTitle().textContent).toBe('heist.md');
  });

  it("a mirrored entry shows '(mirrored from X's side)'", () => {
    render({ history: history([entry({ mirroredFrom: 'Anna' })]) });
    expect(row().querySelector('.rel-tag-popover-mirrored')!.textContent).toBe(
      "(mirrored from Anna's side)",
    );
  });

  it('Escape closes and returns focus to the name', () => {
    renderControlled();
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('an outside mousedown closes', () => {
    renderControlled();
    fireEvent.mouseDown(document.body);
    expect(dialog()).toBeNull();
  });

  it('a mousedown inside or on the name does not close', () => {
    const onClose = vi.fn();
    render({ onClose });
    fireEvent.mouseDown(row());
    fireEvent.mouseDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('× closes and returns focus to the name', () => {
    renderControlled();
    fireEvent.click(container.querySelector('[aria-label="Close"]')!);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('it is placed below the anchor via computeCaretPlacement', () => {
    const rect = { left: 40, top: 100, right: 90, bottom: 120, width: 50, height: 20 } as DOMRect;
    anchor.getBoundingClientRect = () => rect;
    render();
    expect(computeCaretPlacement).toHaveBeenCalledWith(
      rect,
      { width: 0, height: 0 },
      { width: window.innerWidth, height: window.innerHeight },
      'below',
    );
    expect(dialog()!.style.top).toBe('122px');
    expect(dialog()!.style.left).toBe('40px');
  });

  it('re-places on window resize and scroll, and stops after unmount', () => {
    render();
    const calls = vi.mocked(computeCaretPlacement).mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    act(() => {
      document.body.dispatchEvent(new Event('scroll'));
    });
    expect(vi.mocked(computeCaretPlacement).mock.calls.length).toBe(calls + 2);
    act(() => root.render(null));
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(vi.mocked(computeCaretPlacement).mock.calls.length).toBe(calls + 2);
  });

  it('measures the content height, not the height capped by an earlier placement', () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const height = this.style.maxHeight ? 100 : 400;
        return { left: 0, top: 0, right: 360, bottom: height, width: 360, height } as DOMRect;
      });
    try {
      render();
      vi.mocked(computeCaretPlacement).mockClear();
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(vi.mocked(computeCaretPlacement).mock.calls[0][1]).toEqual({
        width: 360,
        height: 400,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("ignores scrolls inside the popover's own list", () => {
    render();
    const calls = vi.mocked(computeCaretPlacement).mock.calls.length;
    act(() => {
      container.querySelector('.rel-tag-popover-list')!.dispatchEvent(new Event('scroll'));
    });
    expect(vi.mocked(computeCaretPlacement).mock.calls.length).toBe(calls);
    act(() => {
      document.body.dispatchEvent(new Event('scroll'));
    });
    expect(vi.mocked(computeCaretPlacement).mock.calls.length).toBe(calls + 1);
  });

  it('it is a labelled dialog', () => {
    render();
    const d = dialog()!;
    expect(d.getAttribute('aria-labelledby')).toBe(header().id);
    expect(header().id).not.toBe('');
  });
});
