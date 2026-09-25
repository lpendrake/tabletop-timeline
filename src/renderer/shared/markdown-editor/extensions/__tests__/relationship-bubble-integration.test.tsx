// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { relationshipDirectives, setDirectiveContext } from '../relationship-directives';
import {
  relationshipBubble,
  type RelationshipBubbleHostContext,
} from '../relationship-bubble-view-plugin';
import { bubbleStateField } from '../relationship-bubble-state';
import { serialiseTemplate } from '../../../../../shared/relationships/directives/index';
import { pf2eReputationSpec } from '../../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;

const FULL_CHANGE_DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

interface Setup {
  view: EditorView;
  container: HTMLDivElement;
}

function makeView(doc: string, ctx: Partial<RelationshipBubbleHostContext> = {}): Setup {
  const context: RelationshipBubbleHostContext = {
    library: { custom: [], optionAdditions: {} },
    defaultReason: 'Unspecified',
    noteOptions: () => [
      { id: 'a1b2', path: 'a1b2', label: 'White Tigers' },
      { id: 'c3d4', path: 'c3d4', label: 'The Party' },
    ],
    ...ctx,
  };

  const state = EditorState.create({
    doc,
    extensions: [history(), relationshipDirectives({}), relationshipBubble(() => context)],
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new EditorView({ state, parent: container });
  act(() => {
    view.dispatch({
      effects: setDirectiveContext.of({
        library: { custom: [], optionAdditions: {} },
        defaultReason: 'Unspecified',
      }),
    });
  });
  return { view, container };
}

function destroy({ view, container }: Setup): void {
  view.destroy();
  container.remove();
}

let cleanup: Setup[] = [];
afterEach(() => {
  cleanup.forEach(destroy);
  cleanup = [];
  document.querySelectorAll('.relationship-bubble-host').forEach((el) => el.remove());
});

function track(setup: Setup): Setup {
  cleanup.push(setup);
  return setup;
}

function bubbleInput(): HTMLInputElement {
  const host = document.querySelector('.relationship-bubble-host')!;
  return host.querySelector('input')!;
}

describe('relationship bubble — full mount', () => {
  it('clicking a finished value reopens its bubble with the current value and rewrites only that token', () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE, { defaultReason: 'Unspecified' }));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;

    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(view.state.field(bubbleStateField)).toEqual({ anchor: 0, role: 'amount' });
    expect(bubbleInput().value).toBe('-2');

    act(() => {
      fireEvent.change(bubbleInput(), { target: { value: '9' } });
    });
    act(() => {
      fireEvent.keyDown(bubbleInput(), { key: 'Enter' });
    });

    expect(view.state.doc.toString()).toBe(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '9',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'attacked their warehouse',
      }),
    );
  });

  it("Ctrl+Z inside the bubble's input does not undo the document", () => {
    const setup = track(makeView(FULL_CHANGE_DIRECTIVE));
    const { view } = setup;
    const amountValue = view.dom.querySelector<HTMLElement>('.cm-directive-value-role-amount')!;

    act(() => {
      amountValue.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    const docBefore = view.state.doc.toString();
    const el = bubbleInput();
    // The bubble's input is mounted on document.body, entirely outside
    // view.dom — CodeMirror's own keymap (attached to view.dom) never sees
    // this event, so document undo can't fire from it.
    act(() => {
      fireEvent.keyDown(el, { key: 'z', ctrlKey: true });
    });
    expect(view.state.doc.toString()).toBe(docBefore);
  });
});
