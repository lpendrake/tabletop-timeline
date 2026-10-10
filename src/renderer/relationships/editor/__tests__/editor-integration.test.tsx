// @vitest-environment happy-dom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { EditorView } from '@codemirror/view';
import { MarkdownEditor } from '../../../shared/markdown-editor';
import { relationshipEditorExtensions } from '../extensions';
import { serialiseTemplate } from '../../../../shared/relationships/directives/index';
import { pf2eReputationSpec } from '../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
const FULL_CHANGE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'x',
});
const EMPTY_CHANGE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE);

const LIBRARY = { custom: [], optionAdditions: {} };
const extensionsFor = (defaultReason: string) =>
  relationshipEditorExtensions({
    library: LIBRARY,
    defaultReason,
    place: 'event',
    choices: { noteOptions: () => [] },
  });

let container: HTMLDivElement;
let root: Root;

function render(el: ReactElement) {
  act(() => root.render(el));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function setup() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

describe('MarkdownEditor with relationshipEditorExtensions', () => {
  it('renders a directive in live mode and its raw text in source mode', () => {
    setup();
    const live = extensionsFor('Unspecified');
    render(<MarkdownEditor content={FULL_CHANGE} onChange={() => {}} liveExtensions={live} />);
    expect(container.querySelector('.cm-directive')).not.toBeNull();

    render(
      <MarkdownEditor
        content={FULL_CHANGE}
        onChange={() => {}}
        liveExtensions={live}
        isSourceMode
      />,
    );
    expect(container.querySelector('.cm-directive')).toBeNull();
    expect(container.textContent).toContain('rp01.change');
  });

  it('a title change updates the placeholder without remounting the editor', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    render(
      <MarkdownEditor
        content={EMPTY_CHANGE}
        onChange={() => {}}
        viewRef={viewRef}
        liveExtensions={extensionsFor('Ambush')}
      />,
    );
    const placeholder = () =>
      container.querySelector('.cm-directive-placeholder-default')?.textContent;
    expect(placeholder()).toBe('Ambush');
    const view = viewRef.current;

    render(
      <MarkdownEditor
        content={EMPTY_CHANGE}
        onChange={() => {}}
        viewRef={viewRef}
        liveExtensions={extensionsFor('Night ambush')}
      />,
    );
    expect(placeholder()).toBe('Night ambush');
    expect(viewRef.current).toBe(view);
  });
});
