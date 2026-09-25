// @vitest-environment happy-dom
// Required so React's `act()` works correctly in happy-dom.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef, ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EditorView } from '@codemirror/view';
import { MarkdownEditor } from '../markdown-editor';
import { FormatToolbar } from '../format-toolbar';
import type { EditorMenuExtraItems } from '../extensions/editor-context-menu';

const showContextMenuMock = vi.fn();

vi.mock('../../context-menu', async () => {
  const actual = await vi.importActual<typeof import('../../context-menu')>('../../context-menu');
  return { ...actual, showContextMenu: (...args: unknown[]) => showContextMenuMock(...args) };
});

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

function renderEl(el: ReactElement) {
  act(() => root.render(el));
}

// ---------------------------------------------------------------------------
// FormatToolbar — pure React, no CM6 state needed
// ---------------------------------------------------------------------------

describe('FormatToolbar', () => {
  afterEach(teardown);

  it('renders formatting buttons when isEditable is true', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<FormatToolbar viewRef={viewRef} isEditable={true} />);
    expect(container.querySelector('[title="Bold (Ctrl+B)"]')).not.toBeNull();
    expect(container.querySelector('[title="Italic (Ctrl+I)"]')).not.toBeNull();
    expect(container.querySelector('[title="Cycle heading"]')).not.toBeNull();
  });

  it('hides formatting buttons when isEditable is false', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<FormatToolbar viewRef={viewRef} isEditable={false} />);
    expect(container.querySelector('[title="Bold (Ctrl+B)"]')).toBeNull();
  });

  it('renders footerSlot content', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(
      <FormatToolbar
        viewRef={viewRef}
        isEditable={true}
        footerSlot={<button data-testid="meta-btn">Meta</button>}
      />,
    );
    expect(container.querySelector('[data-testid="meta-btn"]')).not.toBeNull();
  });

  it('renders footerSlot even when isEditable is false', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(
      <FormatToolbar
        viewRef={viewRef}
        isEditable={false}
        footerSlot={<span data-testid="mode-btn">Source</span>}
      />,
    );
    expect(container.querySelector('[data-testid="mode-btn"]')).not.toBeNull();
  });

  it('renders formatting buttons AND footerSlot together', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(
      <FormatToolbar
        viewRef={viewRef}
        isEditable={true}
        footerSlot={<button data-testid="slot">Slot</button>}
      />,
    );
    expect(container.querySelector('[title="Bold (Ctrl+B)"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="slot"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MarkdownEditor wrapper
// ---------------------------------------------------------------------------

describe('MarkdownEditor', () => {
  afterEach(teardown);

  it('mounts without crashing with minimal props', () => {
    setup();
    renderEl(<MarkdownEditor content="" onChange={vi.fn()} />);
    expect(container.querySelector('.markdown-editor-container')).not.toBeNull();
  });

  it('populates viewRef on mount', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<MarkdownEditor content="hello" onChange={vi.fn()} viewRef={viewRef} />);
    expect(viewRef.current).toBeInstanceOf(EditorView);
  });

  it('clears viewRef on unmount', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<MarkdownEditor content="hello" onChange={vi.fn()} viewRef={viewRef} />);
    expect(viewRef.current).toBeInstanceOf(EditorView);
    teardown();
    expect(viewRef.current).toBeNull();
  });

  it('calls onSaveInstance with state + compartment on unmount', () => {
    setup();
    const onSaveInstance = vi.fn();
    renderEl(
      <MarkdownEditor content="test doc" onChange={vi.fn()} onSaveInstance={onSaveInstance} />,
    );
    teardown();
    expect(onSaveInstance).toHaveBeenCalledOnce();
    const [inst] = onSaveInstance.mock.calls[0];
    expect(inst).toHaveProperty('state');
    expect(inst).toHaveProperty('modeCompartment');
  });

  it('restores from savedInstance — doc is preserved', () => {
    setup();
    const onSaveInstance = vi.fn();
    renderEl(
      <MarkdownEditor
        content="original content"
        onChange={vi.fn()}
        onSaveInstance={onSaveInstance}
      />,
    );
    teardown();
    const savedInstance = onSaveInstance.mock.calls[0][0];

    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(
      <MarkdownEditor
        content="original content"
        onChange={vi.fn()}
        savedInstance={savedInstance}
        viewRef={viewRef}
      />,
    );
    expect(viewRef.current?.state.doc.toString()).toBe('original content');
  });

  it('calls onChange when the editor view dispatches a doc change', () => {
    setup();
    const onChange = vi.fn();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<MarkdownEditor content="" onChange={onChange} viewRef={viewRef} />);

    act(() => {
      viewRef.current?.dispatch({ changes: { from: 0, to: 0, insert: 'hello' } });
    });

    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('mounts in source mode without crashing', () => {
    setup();
    renderEl(<MarkdownEditor content="# heading" onChange={vi.fn()} isSourceMode={true} />);
    expect(container.querySelector('.markdown-editor-container')).not.toBeNull();
  });

  it('relationship directives: live mode renders a block, source mode shows raw text', () => {
    setup();
    const directive =
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}';
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(
      <MarkdownEditor
        content={directive}
        onChange={vi.fn()}
        viewRef={viewRef}
        relationshipDirectives={{
          library: { custom: [], optionAdditions: {} },
          defaultReason: 'Unspecified',
        }}
      />,
    );
    expect(container.querySelector('.cm-directive')).not.toBeNull();

    renderEl(
      <MarkdownEditor
        content={directive}
        onChange={vi.fn()}
        viewRef={viewRef}
        isSourceMode={true}
        relationshipDirectives={{
          library: { custom: [], optionAdditions: {} },
          defaultReason: 'Unspecified',
        }}
      />,
    );
    expect(container.querySelector('.cm-directive')).toBeNull();
    expect(container.textContent).toContain('rp01.change');
  });

  it('does not crash when optional features are omitted', () => {
    // wikiLinks, imagePaste, dropLink omitted — should mount cleanly
    setup();
    renderEl(<MarkdownEditor content="no extras" onChange={vi.fn()} />);
    expect(container.querySelector('.markdown-editor-container')).not.toBeNull();
  });

  it('contextMenu.extraItems prop is read at open time', () => {
    setup();
    showContextMenuMock.mockClear();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;

    const makeItems =
      (label: string): EditorMenuExtraItems =>
      () => [{ kind: 'action', label, onSelect: () => {} }];

    renderEl(
      <MarkdownEditor
        content="hello"
        onChange={vi.fn()}
        viewRef={viewRef}
        contextMenu={{ extraItems: makeItems('First') }}
      />,
    );

    // Change the prop after mount — the base extension layer is built once,
    // but getExtraItems() should read the latest callback each time it opens.
    renderEl(
      <MarkdownEditor
        content="hello"
        onChange={vi.fn()}
        viewRef={viewRef}
        contextMenu={{ extraItems: makeItems('Second') }}
      />,
    );

    const view = viewRef.current!;
    vi.spyOn(view, 'posAtCoords').mockReturnValue(null);
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 1,
      clientY: 1,
    });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });

    expect(showContextMenuMock).toHaveBeenCalledTimes(1);
    const items = showContextMenuMock.mock.calls[0][0] as { kind: string; label?: string }[];
    expect(items.some((i) => i.label === 'Second')).toBe(true);
    expect(items.some((i) => i.label === 'First')).toBe(false);
  });

  it('mounts in readOnly mode without onChange and is non-editable', () => {
    setup();
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<MarkdownEditor content="read me" readOnly viewRef={viewRef} />);
    expect(container.querySelector('.markdown-editor-container')).not.toBeNull();
    expect(viewRef.current?.state.readOnly).toBe(true);
    expect(viewRef.current?.contentDOM.contentEditable).toBe('false');
  });

  it('does not invoke onChange in readOnly mode when no onChange is supplied', () => {
    setup();
    // Should mount without throwing even with no onChange
    const viewRef = createRef<EditorView | null>() as React.MutableRefObject<EditorView | null>;
    renderEl(<MarkdownEditor content="static" readOnly viewRef={viewRef} />);
    // EditorState.readOnly blocks user-initiated mutations (keyboard/paste), not
    // programmatic dispatch — so just confirm the readOnly facet is set.
    expect(viewRef.current?.state.readOnly).toBe(true);
  });
});
