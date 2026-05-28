// @vitest-environment happy-dom
// Required so React's `act()` works correctly in happy-dom.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EditorView } from '@codemirror/view';
import { MarkdownEditor } from '../markdown-editor';

let container: HTMLDivElement;
let root: Root;

function setup() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
}

describe('MarkdownEditor initialCursor prop', () => {
  afterEach(teardown);

  it('places the caret at the given offset', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    const content = 'hello world';
    act(() => {
      root.render(
        <MarkdownEditor
          content={content}
          onChange={() => {}}
          viewRef={viewRef}
          initialCursor={5}
        />,
      );
    });
    expect(viewRef.current?.state.selection.main.head).toBe(5);
  });

  it('clamps an out-of-range offset to the document length', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    const content = 'abc';
    act(() => {
      root.render(
        <MarkdownEditor
          content={content}
          onChange={() => {}}
          viewRef={viewRef}
          initialCursor={9999}
        />,
      );
    });
    expect(viewRef.current?.state.selection.main.head).toBe(content.length);
  });

  it('defaults to offset 0 when initialCursor is omitted', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    act(() => {
      root.render(<MarkdownEditor content="some content" onChange={() => {}} viewRef={viewRef} />);
    });
    expect(viewRef.current?.state.selection.main.head).toBe(0);
  });
});
