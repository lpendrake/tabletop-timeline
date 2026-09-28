// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parsedDirectivesField, directivesIn, directiveRanges } from '../parsed-directives';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import { pf2eReputationSpec } from '../../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;

const FULL_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

function makeView(doc: string): EditorView {
  const state = EditorState.create({ doc, extensions: [parsedDirectivesField] });
  return new EditorView({ state });
}

describe('parsedDirectivesField', () => {
  it('parses the document once at creation', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    expect(view.state.field(parsedDirectivesField)).toHaveLength(1);
    expect(view.state.field(parsedDirectivesField)[0].trackId).toBe('rp01');
    view.destroy();
  });

  it('reparses on a document change', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    view.dispatch({ changes: { from: 0, insert: 'x ' } });
    const directives = view.state.field(parsedDirectivesField);
    expect(directives).toHaveLength(1);
    expect(directives[0].from).toBe(2);
    view.destroy();
  });

  it('does NOT reparse on a selection-only transaction — the array is reused by reference', () => {
    const view = makeView(FULL_CHANGE_DIRECTIVE);
    const before = view.state.field(parsedDirectivesField);

    view.dispatch({ selection: { anchor: 1 } });
    const after = view.state.field(parsedDirectivesField);

    expect(after).toBe(before);
    view.destroy();
  });

  it('directivesIn falls back to parsing directly when the field is not wired into the editor', () => {
    const state = EditorState.create({ doc: FULL_CHANGE_DIRECTIVE });
    expect(directivesIn(state)).toHaveLength(1);
    expect(directivesIn(state)[0].trackId).toBe('rp01');
  });

  it('directiveRanges reports the source range of every directive', () => {
    const view = makeView(`x ${FULL_CHANGE_DIRECTIVE} y`);
    const ranges = directiveRanges(view.state);
    expect(ranges).toEqual([{ from: 2, to: 2 + FULL_CHANGE_DIRECTIVE.length }]);
    view.destroy();
  });
});
