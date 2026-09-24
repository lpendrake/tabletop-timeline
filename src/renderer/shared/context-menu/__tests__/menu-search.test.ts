import { describe, it, expect, vi } from 'vitest';
import { filterMenu, pickAutoTarget } from '../menu-search';
import { compareRanked } from '../../search/rank';
import type { ContextMenuItem } from '../types';

function formattingMenu(): ContextMenuItem[] {
  return [
    { kind: 'action', label: 'Copy', onSelect: vi.fn() },
    { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
    { kind: 'action', label: 'Details', onSelect: vi.fn() },
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: 'Formatting',
      items: [
        {
          kind: 'submenu',
          label: 'Heading',
          items: [{ kind: 'action', label: 'Heading 1', onSelect: vi.fn() }],
        },
        { kind: 'action', label: 'Bold', onSelect: vi.fn() },
      ],
    },
    {
      kind: 'submenu',
      label: 'Export',
      items: [{ kind: 'action', label: 'As JSON', onSelect: vi.fn() }],
    },
  ];
}

describe('filterMenu', () => {
  it('prefix beats substring', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Subheading', onSelect: vi.fn() },
      { kind: 'action', label: 'Heading 1', onSelect: vi.fn() },
    ];
    const { targets } = filterMenu(items, 'hea');
    expect(targets.map((t) => t.labels[0])).toEqual(['Heading 1', 'Subheading']);
  });

  it('submenu visible only when a descendant matches', () => {
    const { visible } = filterMenu(formattingMenu(), 'hea');
    const labels = visible.map((n) => n.item.label);
    expect(labels).toContain('Formatting');
    expect(labels).not.toContain('Export');

    const formatting = visible.find((n) => n.item.label === 'Formatting');
    expect(formatting?.kind).toBe('submenu');
    if (formatting?.kind === 'submenu') {
      const heading = formatting.children.find((n) => n.item.label === 'Heading');
      expect(heading?.kind).toBe('submenu');
      if (heading?.kind === 'submenu') {
        expect(heading.children.map((n) => n.item.label)).toEqual(['Heading 1']);
      }
    }
  });

  it('target carries its label path', () => {
    const { targets } = filterMenu(formattingMenu(), 'heading 1');
    expect(targets).toHaveLength(1);
    expect(targets[0].labels).toEqual(['Formatting', 'Heading', 'Heading 1']);
  });

  it('ties keep menu order', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Bold', onSelect: vi.fn() },
      { kind: 'action', label: 'Blockquote', onSelect: vi.fn() },
      { kind: 'action', label: 'Bullet list', onSelect: vi.fn() },
    ];
    const { targets } = filterMenu(items, 'b');
    expect(targets.map((t) => t.labels[0])).toEqual(['Bold', 'Blockquote', 'Bullet list']);
  });

  it('skips disabled items as targets', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Details', onSelect: vi.fn(), disabled: true },
      { kind: 'action', label: 'Details 2', onSelect: vi.fn() },
    ];
    const { targets, visible } = filterMenu(items, 'det');
    expect(targets.map((t) => t.labels[0])).toEqual(['Details 2']);
    expect(visible.map((n) => n.item.label)).toEqual(['Details 2']);
  });

  it('keywords are searched', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'H1', onSelect: vi.fn(), keywords: ['heading'] },
    ];
    const { targets } = filterMenu(items, 'head');
    expect(targets).toHaveLength(1);
    expect(targets[0].labels).toEqual(['H1']);
  });

  it('ordering unchanged (compareRanked): same order as sorting the raw ranks/indices directly', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Blockquote', onSelect: vi.fn() },
      { kind: 'action', label: 'Subheading', onSelect: vi.fn() },
      { kind: 'action', label: 'Bold', onSelect: vi.fn() },
      { kind: 'action', label: 'Heading 1', onSelect: vi.fn() },
    ];
    const { targets } = filterMenu(items, 'b');

    // Reproduce the expected order by ranking/sorting independently with
    // the shared `compareRanked` comparator `filterMenu` delegates to.
    const expected = items
      .map((item, index) => ({ label: (item as { label: string }).label, index }))
      .filter((entry) => entry.label.toLowerCase().includes('b'))
      .map((entry) => ({
        ...entry,
        rank: entry.label.toLowerCase().startsWith('b') ? (0 as const) : (2 as const),
      }))
      .sort(compareRanked);

    expect(targets.map((t) => t.labels[0])).toEqual(expected.map((e) => e.label));
  });
});

describe('pickAutoTarget', () => {
  it('never picks a danger item', () => {
    const { targets } = filterMenu(formattingMenu(), 'de');
    const auto = pickAutoTarget(targets);
    expect(auto?.labels[0]).toBe('Details');
    expect(auto?.danger).toBe(false);
  });

  it('returns null when only danger items match, but the danger item is still listed', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
    ];
    const { targets } = filterMenu(items, 'del');
    expect(targets).toHaveLength(1);
    expect(pickAutoTarget(targets)).toBeNull();
  });
});
