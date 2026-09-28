import { describe, it, expect } from 'vitest';
import { composeExtraItems } from '../compose-extra-items';
import type { EditorMenuContext } from '../extensions/editor-context-menu';
import type { ContextMenuItem } from '../../context-menu';

const ctx = {} as EditorMenuContext;

describe('composeExtraItems', () => {
  it('New note and Relationships both appear in the note and event editor menus', () => {
    const newNote = (): ContextMenuItem[] => [
      { kind: 'action', label: 'New note…', onSelect: () => {} },
    ];
    const relationships = (): ContextMenuItem[] => [
      { kind: 'submenu', label: 'Relationships', items: [] },
    ];

    const combined = composeExtraItems(newNote, relationships);
    const items = combined(ctx);

    expect(
      items.map((i) => (i.kind !== 'separator' && i.kind !== 'header' ? i.label : null)),
    ).toEqual(['New note…', 'Relationships']);
  });

  it('skips undefined sources and preserves order', () => {
    const only = (): ContextMenuItem[] => [{ kind: 'action', label: 'Only', onSelect: () => {} }];
    const combined = composeExtraItems(undefined, only, undefined);
    const items = combined(ctx);
    expect(
      items.map((i) => (i.kind !== 'separator' && i.kind !== 'header' ? i.label : null)),
    ).toEqual(['Only']);
  });
});
