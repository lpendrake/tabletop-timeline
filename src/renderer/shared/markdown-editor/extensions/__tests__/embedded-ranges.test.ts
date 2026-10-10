// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import {
  embeddedRanges,
  embeddedRangesIn,
  isInsideEmbeddedRange,
  isRangeWithinEmbedded,
} from '../embedded-ranges';
import { wikiLinks, buildDecorations } from '../wiki-links';

function contributor(...ranges: { from: number; to: number }[]): Extension {
  return embeddedRanges.of(() => ranges);
}

function decoratedCount(state: EditorState): number {
  let count = 0;
  buildDecorations(state, {}).between(0, state.doc.length, () => {
    count++;
  });
  return count;
}

describe('embeddedRanges', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    views.splice(0).forEach((v) => v.destroy());
  });

  function mount(doc: string, extensions: Extension[], anchor = 0): EditorView {
    const view = new EditorView({
      state: EditorState.create({ doc, extensions, selection: { anchor } }),
      parent: document.body,
    });
    views.push(view);
    return view;
  }

  it('combines ranges from several contributors', () => {
    const state = EditorState.create({
      doc: 'x'.repeat(30),
      extensions: [contributor({ from: 1, to: 4 }), contributor({ from: 10, to: 20 })],
    });
    expect(embeddedRangesIn(state)).toEqual([
      { from: 1, to: 4 },
      { from: 10, to: 20 },
    ]);
  });

  it('isInsideEmbeddedRange is false at the edges and true inside', () => {
    const state = EditorState.create({
      doc: 'x'.repeat(30),
      extensions: [contributor({ from: 5, to: 10 })],
    });
    const ranges = embeddedRangesIn(state);
    expect(isInsideEmbeddedRange(ranges, 5)).toBe(false);
    expect(isInsideEmbeddedRange(ranges, 6)).toBe(true);
    expect(isInsideEmbeddedRange(ranges, 9)).toBe(true);
    expect(isInsideEmbeddedRange(ranges, 10)).toBe(false);
  });

  it('isRangeWithinEmbedded includes the edges and excludes a range one char past', () => {
    const ranges = [{ from: 5, to: 10 }];
    expect(isRangeWithinEmbedded(ranges, { from: 5, to: 10 })).toBe(true);
    expect(isRangeWithinEmbedded(ranges, { from: 5, to: 7 })).toBe(true);
    expect(isRangeWithinEmbedded(ranges, { from: 8, to: 10 })).toBe(true);
    expect(isRangeWithinEmbedded(ranges, { from: 4, to: 10 })).toBe(false);
    expect(isRangeWithinEmbedded(ranges, { from: 5, to: 11 })).toBe(false);
    expect(isRangeWithinEmbedded([], { from: 5, to: 10 })).toBe(false);
  });

  it('does not decorate a wiki link inside an embedded range', () => {
    const doc = 'a [[abc1]] b';
    const plain = EditorState.create({ doc });
    const embedded = EditorState.create({
      doc,
      extensions: [contributor({ from: 0, to: doc.length })],
    });
    expect(decoratedCount(plain)).toBe(2);
    expect(decoratedCount(embedded)).toBe(0);
  });

  it('skips the Backspace rule inside an embedded range', () => {
    const doc = '[[abc1]] tail';
    const backspace = () => new KeyboardEvent('keydown', { key: 'Backspace' });

    const free = mount(doc, [wikiLinks({})], 8);
    expect(runScopeHandlers(free, backspace(), 'editor')).toBe(true);
    expect(free.state.selection.main.head).toBe(2);

    const embedded = mount(doc, [wikiLinks({}), contributor({ from: 0, to: doc.length })], 8);
    expect(runScopeHandlers(embedded, backspace(), 'editor')).toBe(false);
    expect(embedded.state.selection.main.head).toBe(8);
  });

  it('adding a contributor via Compartment.reconfigure removes decorations inside its range without a doc change', () => {
    const doc = 'a [[abc1]] b';
    const host = new Compartment();
    const view = mount(doc, [wikiLinks({}), host.of([])]);
    expect(view.dom.querySelectorAll('.cm-note-link')).toHaveLength(1);

    view.dispatch({
      effects: host.reconfigure(contributor({ from: 0, to: doc.length })),
    });

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.dom.querySelectorAll('.cm-note-link')).toHaveLength(0);
  });
});
