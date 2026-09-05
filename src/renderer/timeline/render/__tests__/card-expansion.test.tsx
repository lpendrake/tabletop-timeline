// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Render MarkdownPreview as a simple marker so we can assert it is (or isn't) shown,
// without pulling in the full CodeMirror-based preview.
vi.mock('../../../shared/markdown-editor', () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

import { CardExpansion } from '../card-expansion';

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

beforeEach(setup);
afterEach(teardown);

const NOOP_SIZE = { width: 400, expandedHeight: 200 };

function renderExpansion(body: string | null, status: 'loading' | 'loaded' | 'error') {
  act(() => {
    root.render(
      <CardExpansion
        body={body}
        status={status}
        expandsDown={true}
        size={NOOP_SIZE}
        centerX={100}
        onSizeChange={() => {}}
        onResizeDragChange={() => {}}
      />,
    );
  });
}

describe('CardExpansion', () => {
  it('renders a failure message instead of the loading text when the body could not be loaded', () => {
    renderExpansion(null, 'error');

    expect(container.textContent).toContain('Failed to load event.');
    expect(container.textContent).not.toContain('Loading…');
    expect(container.querySelector('[data-testid="markdown-preview"]')).toBeNull();
  });

  it('renders the loading text while still loading', () => {
    renderExpansion(null, 'loading');

    expect(container.textContent).toContain('Loading…');
    expect(container.textContent).not.toContain('Failed to load event.');
  });

  it('renders the markdown preview once the body has loaded', () => {
    renderExpansion('# Hello', 'loaded');

    expect(container.querySelector('[data-testid="markdown-preview"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Loading…');
    expect(container.textContent).not.toContain('Failed to load event.');
  });
});
