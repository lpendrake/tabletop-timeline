// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import {
  bubbleStateField,
  openDirectiveBubble,
  closeDirectiveBubble,
  insertDirective,
  commitBubbleField,
} from '../relationship-bubble-state';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import { pf2eReputationSpec } from '../../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;

const FULL_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

let views: EditorView[] = [];

function makeView(doc: string): EditorView {
  const state = EditorState.create({ doc, extensions: [history(), bubbleStateField] });
  const view = new EditorView({ state });
  views.push(view);
  return view;
}

afterEach(() => {
  views.forEach((v) => v.destroy());
  views = [];
});

describe('bubbleStateField — following and closing', () => {
  it('bubble follows its blank when text above changes', () => {
    const view = makeView(`x ${FULL_CHANGE_DIRECTIVE}`);
    const anchor = 2;
    openDirectiveBubble(view, anchor, 'amount');
    expect(view.state.field(bubbleStateField)).toEqual({ anchor, role: 'amount' });

    view.dispatch({ changes: { from: 0, insert: 'more ' } });
    expect(view.state.field(bubbleStateField)).toEqual({
      anchor: anchor + 'more '.length,
      role: 'amount',
    });
  });

  it('bubble closes cleanly when its directive is deleted', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'amount');
    expect(view.state.field(bubbleStateField)).not.toBeNull();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    expect(view.state.field(bubbleStateField)).toBeNull();
  });

  it('bubble closes cleanly when its insertion is undone', () => {
    const view = makeView('');
    insertDirective(view, 0, 0, FULL_CHANGE_DIRECTIVE);
    expect(view.state.field(bubbleStateField)).not.toBeNull();

    undo(view);
    expect(view.state.doc.toString()).toBe('');
    expect(view.state.field(bubbleStateField)).toBeNull();
  });

  it('bubble closes cleanly when the document is replaced externally', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'amount');
    expect(view.state.field(bubbleStateField)).not.toBeNull();

    // A full-document replace, as when a file is reloaded from disk.
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'totally different text' },
    });
    expect(view.state.field(bubbleStateField)).toBeNull();
  });

  it('closeDirectiveBubble closes it directly', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'amount');
    closeDirectiveBubble(view);
    expect(view.state.field(bubbleStateField)).toBeNull();
  });
});

describe('insertDirective', () => {
  it('is one undo step and opens the bubble for the first blank', () => {
    const view = makeView('before ');
    const template = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {});
    insertDirective(view, 'before '.length, 'before '.length, template);

    expect(view.state.doc.toString()).toBe(`before ${template}`);
    expect(view.state.field(bubbleStateField)).toEqual({
      anchor: 'before '.length,
      role: 'amount',
    });

    undo(view);
    expect(view.state.doc.toString()).toBe('before ');
  });

  it('opens the first EMPTY blank when some are already filled, in token order', () => {
    const view = makeView('');
    const template = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
      amount: '-2',
      observer: '[[a1b2]]',
    });
    insertDirective(view, 0, 0, template);
    expect(view.state.field(bubbleStateField)?.role).toBe('holder');
  });
});

describe('commitBubbleField', () => {
  it('each accepted field is its own undo step; Ctrl+Z after closing restores the previous value', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'amount');

    const outcome = commitBubbleField(view, 0, 'amount', '5', 'advance');
    expect(outcome).toBe('moved');
    expect(view.state.field(bubbleStateField)?.role).toBe('observer');
    expect(view.state.doc.toString()).toContain('{amount:5}');

    undo(view);
    expect(view.state.doc.toString()).toContain('{amount:-2}');
  });

  it('advancing past the last blank closes the bubble', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'reason');
    const outcome = commitBubbleField(view, 0, 'reason', 'new reason', 'advance');
    expect(outcome).toBe('closed');
    expect(view.state.field(bubbleStateField)).toBeNull();
  });

  it('going back from the first blank just stays put', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    openDirectiveBubble(view, 0, 'amount');
    const outcome = commitBubbleField(view, 0, 'amount', '7', 'back');
    expect(outcome).toBe('stayed');
    expect(view.state.field(bubbleStateField)).toEqual({ anchor: 0, role: 'amount' });
  });

  it('rewrites only the committed role, leaving the rest of the directive untouched', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    commitBubbleField(view, 0, 'reason', 'new reason', 'advance');
    expect(view.state.doc.toString()).toBe(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '-2',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'new reason',
      }),
    );
  });

  it('fails harmlessly when the directive no longer exists', () => {
    const view = makeView('plain text');
    const outcome = commitBubbleField(view, 0, 'amount', '5', 'advance');
    expect(outcome).toBe('failed');
  });
});
