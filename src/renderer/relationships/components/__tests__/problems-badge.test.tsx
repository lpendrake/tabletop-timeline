// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { ProblemsBadge } from '../problems-badge';
import type { InvalidDirectiveEntry } from '../../../../shared/relationships/ipc-types';
import type { EntityIndexEntry } from '../../../../types/global';

const entry = (over: Partial<InvalidDirectiveEntry> = {}): InvalidDirectiveEntry => ({
  path: 'timeline/a.md',
  ordinal: 0,
  trackId: 'rep',
  from: 0,
  to: 5,
  messages: ['bad value'],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  problems: InvalidDirectiveEntry[],
  entityIndex: EntityIndexEntry[] = [],
  handlers: { onOpenById?: (id: string) => void; onOpenEvent?: (f: string) => void } = {},
) {
  act(() =>
    root.render(
      <ProblemsBadge
        problems={problems}
        entityIndex={entityIndex}
        onOpenById={handlers.onOpenById ?? vi.fn()}
        onOpenEvent={handlers.onOpenEvent ?? vi.fn()}
      />,
    ),
  );
}
const button = () => container.querySelector<HTMLButtonElement>('.rel-problems-pill');
const opens = () => Array.from(container.querySelectorAll('.rel-problem-open'));

describe('ProblemsBadge', () => {
  it("no problems → no badge; 1 → '1 problem'; 3 → '3 problems'", () => {
    render([]);
    expect(button()).toBeNull();
    render([entry()]);
    expect(button()!.textContent).toBe('1 problem');
    render([entry(), entry(), entry()]);
    expect(button()!.textContent).toBe('3 problems');
  });

  it('the popover lists every problem with its file, including unknown tracks', () => {
    render([
      entry(),
      entry({ path: 'timeline/b.md', trackId: undefined, messages: ['parse error'] }),
    ]);
    fireEvent.click(button()!);
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(button()!.getAttribute('aria-expanded')).toBe('true');
    expect(button()!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(dialog.textContent).toContain('bad value');
    expect(dialog.textContent).toContain('timeline/a.md');
    expect(dialog.textContent).toContain('parse error');
    expect(dialog.textContent).toContain('timeline/b.md');
  });

  it('Open on an event problem calls onOpenEvent with the filename; on a note calls onOpenById', () => {
    const onOpenEvent = vi.fn();
    const onOpenById = vi.fn();
    const index: EntityIndexEntry[] = [
      { id: 'npc-1', path: 'notes/npcs/bob.md', title: 'Bob', type: 'note' },
    ];
    render([entry(), entry({ path: 'notes/npcs/bob.md' }), entry({ path: 'weird/x.md' })], index, {
      onOpenEvent,
      onOpenById,
    });
    fireEvent.click(button()!);
    // The unknown-path problem has no Open link.
    expect(opens()).toHaveLength(2);
    fireEvent.click(opens()[0]);
    expect(onOpenEvent).toHaveBeenCalledWith('a.md');
    fireEvent.click(button()!);
    fireEvent.click(opens()[1]);
    expect(onOpenById).toHaveBeenCalledWith('npc-1');
  });

  it('Escape closes the popover and returns focus to the badge', () => {
    render([entry()]);
    fireEvent.click(button()!);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('closes on outside mousedown', () => {
    render([entry()]);
    fireEvent.click(button()!);
    fireEvent.mouseDown(document.body);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
