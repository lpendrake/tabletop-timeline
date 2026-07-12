import { describe, it, expect, vi } from 'vitest';
import { buildTagContextMenuItems } from '../tag-context-menu';
import type { ContextMenuItem } from '../../../shared/context-menu';

function labels(items: ContextMenuItem[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === 'action') return [item.label];
    if (item.kind === 'submenu') return [item.label, ...labels(item.items)];
    if (item.kind === 'header') return [item.label];
    return [];
  });
}

function makeHandlers() {
  return {
    onEditTagLabel: vi.fn(),
    onResetTagLabel: vi.fn(),
    onGoTo: vi.fn(),
    onCopyLink: vi.fn(),
    onRemoveTag: vi.fn(),
    onFilterByTag: vi.fn(),
  };
}

/** Finds an action item by label anywhere in the tree (including submenus) and selects it. */
function selectAction(items: ContextMenuItem[], label: string): void {
  for (const item of items) {
    if (item.kind === 'action' && item.label === label) {
      item.onSelect();
      return;
    }
    if (item.kind === 'submenu' && labels(item.items).includes(label)) {
      selectAction(item.items, label);
      return;
    }
  }
  throw new Error(`no action item found with label "${label}"`);
}

describe('buildTagContextMenuItems', () => {
  it('entity tag: exposes override submenu, go-to, copy-link, and filter, but no remove', () => {
    const handlers = makeHandlers();
    const items = buildTagContextMenuItems('id:ab12', 'event.md', handlers);
    const all = labels(items);

    expect(all).toContain('Override tag label');
    expect(all).toContain('Globally');
    expect(all).toContain('Reset global override');
    expect(all).toContain('Go to');
    expect(all).toContain('Copy Link');
    expect(all).toContain('Filter By Tag');
    expect(all).not.toContain('Remove Tag');
  });

  it('custom tag: exposes remove and filter, but no entity items', () => {
    const handlers = makeHandlers();
    const items = buildTagContextMenuItems('villain', 'event.md', handlers);
    const all = labels(items);

    expect(all).toContain('Remove Tag');
    expect(all).toContain('Filter By Tag');
    expect(all).not.toContain('Override tag label');
    expect(all).not.toContain('Go to');
    expect(all).not.toContain('Copy Link');
  });

  it('session tag: only exposes filter (not a valid custom tag, not an entity tag)', () => {
    const handlers = makeHandlers();
    const items = buildTagContextMenuItems('sesh:Session 1', 'event.md', handlers);
    const all = labels(items);

    expect(all).toEqual(['Filter By Tag']);
  });

  it('invokes the entity-id-scoped handlers with the parsed id, not the raw tag', () => {
    const handlers = makeHandlers();
    const items = buildTagContextMenuItems('id:ab12', 'event.md', handlers);

    selectAction(items, 'Globally');
    selectAction(items, 'Reset global override');
    selectAction(items, 'Go to');
    selectAction(items, 'Copy Link');

    expect(handlers.onEditTagLabel).toHaveBeenCalledWith('ab12');
    expect(handlers.onResetTagLabel).toHaveBeenCalledWith('ab12');
    expect(handlers.onGoTo).toHaveBeenCalledWith('ab12');
    expect(handlers.onCopyLink).toHaveBeenCalledWith('ab12');
  });

  it('invokes onRemoveTag with the filename and raw tag for custom tags', () => {
    const handlers = makeHandlers();
    const items = buildTagContextMenuItems('villain', 'event.md', handlers);
    selectAction(items, 'Remove Tag');
    expect(handlers.onRemoveTag).toHaveBeenCalledWith('event.md', 'villain');
  });

  it('invokes onFilterByTag with the raw tag for both entity and custom tags', () => {
    const handlers = makeHandlers();
    const entityItems = buildTagContextMenuItems('id:ab12', 'event.md', handlers);
    selectAction(entityItems, 'Filter By Tag');
    expect(handlers.onFilterByTag).toHaveBeenCalledWith('id:ab12');

    const customItems = buildTagContextMenuItems('villain', 'event.md', handlers);
    selectAction(customItems, 'Filter By Tag');
    expect(handlers.onFilterByTag).toHaveBeenCalledWith('villain');
  });
});
