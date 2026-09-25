// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { filterMenu, pickAutoTarget } from '../../shared/context-menu';
import type { EditorMenuContext } from '../../shared/markdown-editor';
import { bubbleStateField } from '../../shared/markdown-editor/extensions/relationship-bubble-state';
import { buildRelationshipMenuItems } from '../editor-menu';
import type { TrackLibrary } from '../../../shared/relationships';

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

function makeContext(doc = ''): { ctx: EditorMenuContext; container: HTMLDivElement } {
  const state = EditorState.create({ doc, extensions: [history(), bubbleStateField] });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView({ state, parent: container });
  const ctx: EditorMenuContext = {
    view,
    from: 0,
    to: 0,
    selectedText: '',
    replaceRange: () => {},
  };
  return { ctx, container };
}

const views: EditorView[] = [];
afterEach(() => {
  views.forEach((v) => v.destroy());
  views.length = 0;
});

describe('buildRelationshipMenuItems', () => {
  it('lists each enabled track and its actions; disabled tracks are omitted', () => {
    const { ctx, container } = makeContext();
    views.push(ctx.view);
    container.remove();

    const items = buildRelationshipMenuItems(ctx, { library: LIBRARY });
    expect(items).toHaveLength(1);
    const root = items[0];
    if (root.kind !== 'submenu') throw new Error('expected submenu');
    expect(root.label).toBe('Relationships');
    const trackLabels = root.items.map((i) => (i.kind === 'submenu' ? i.label : null));
    expect(trackLabels).toContain('PF2E Reputation');
    expect(trackLabels).toContain('Attitude');
    expect(trackLabels).toContain('Relationship tags');

    const rep = root.items.find((i) => i.kind === 'submenu' && i.label === 'PF2E Reputation');
    if (!rep || rep.kind !== 'submenu') throw new Error('expected PF2E Reputation submenu');
    expect(rep.items.map((a) => (a.kind === 'action' ? a.label : null))).toEqual(['Change', 'Set']);

    const withDisabled = buildRelationshipMenuItems(ctx, {
      library: LIBRARY,
      disabledTrackIds: ['rp01'],
    });
    const disabledRoot = withDisabled[0];
    if (disabledRoot.kind !== 'submenu') throw new Error('expected submenu');
    const disabledLabels = disabledRoot.items.map((i) => (i.kind === 'submenu' ? i.label : null));
    expect(disabledLabels).not.toContain('PF2E Reputation');
  });

  it('/rep then Enter targets PF2E Reputation › Change', () => {
    const { ctx, container } = makeContext();
    views.push(ctx.view);
    container.remove();

    const items = buildRelationshipMenuItems(ctx, { library: LIBRARY });
    const result = filterMenu(items, 'rep');
    const target = pickAutoTarget(result.targets);
    expect(target).not.toBeNull();
    expect(target!.labels).toEqual(['Relationships', 'PF2E Reputation', 'Change']);
  });

  it('choosing an action inserts an empty directive and opens its first bubble', () => {
    const { ctx, container } = makeContext('before\nafter');
    views.push(ctx.view);
    container.remove();

    const from = 'before\n'.length;
    ctx.from = from;
    ctx.to = from;

    const items = buildRelationshipMenuItems(ctx, { library: LIBRARY });
    const root = items[0];
    if (root.kind !== 'submenu') throw new Error('expected submenu');
    const rep = root.items.find((i) => i.kind === 'submenu' && i.label === 'PF2E Reputation');
    if (!rep || rep.kind !== 'submenu') throw new Error('expected PF2E Reputation submenu');
    const change = rep.items.find((a) => a.kind === 'action' && a.label === 'Change');
    if (!change || change.kind !== 'action') throw new Error('expected Change action');

    change.onSelect();

    expect(ctx.view.state.doc.toString()).toContain('{{rp01.change ');
    const bubble = ctx.view.state.field(bubbleStateField, false);
    expect(bubble).not.toBeNull();
    expect(bubble!.anchor).toBe(from);
  });
});
