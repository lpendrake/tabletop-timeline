// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PeekWindow, makeResolveSrc } from '../peek-window';

class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
beforeEach(() => {
  globalThis.ResizeObserver = StubResizeObserver;
});

function makeAnchorRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    left: 100,
    top: 100,
    right: 200,
    bottom: 120,
    width: 100,
    height: 20,
    x: 100,
    y: 100,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

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

afterEach(() => {
  teardown();
  // Remove any portal containers left in body by tests that didn't call teardown early
  document.body.querySelectorAll('.peek-window').forEach((el) => el.parentElement?.remove());
});

const LOADED_CONTENT = '---\ntitle: Bob\n---\nHello world';
const makeNeverFetcher = () => vi.fn(() => new Promise<string>(() => {}));
const makeResolvedFetcher = (content = LOADED_CONTENT) =>
  vi.fn((_path: string, _signal: AbortSignal) => Promise.resolve(content));
const makeRejectedFetcher = (err: Error) =>
  vi.fn((_path: string, _signal: AbortSignal) => Promise.reject(err));

// ─── Mounting & States ────────────────────────────────────────────────────────

describe('mounting & states', () => {
  it('renders portal into document.body, not into the test container', () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/npcs/bob.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    expect(container.querySelector('.peek-window')).toBeNull();
    expect(document.body.querySelector('.peek-window')).not.toBeNull();
  });

  it('shows loading state initially', () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    const win = document.body.querySelector('.peek-window')!;
    expect(win.querySelector('.peek-loading')).not.toBeNull();
    expect(win.querySelector('.peek-error')).toBeNull();
  });

  it('shows title after fetcher resolves', async () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/npcs/bob.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
        />,
      ),
    );
    await act(async () => {});
    const win = document.body.querySelector('.peek-window')!;
    expect(win.querySelector('.peek-title')?.textContent).toBe('Bob');
    expect(win.querySelector('.peek-loading')).toBeNull();
  });

  it('renders MarkdownPreview after fetcher resolves', async () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
        />,
      ),
    );
    await act(async () => {});
    expect(document.body.querySelector('.markdown-editor-container')).not.toBeNull();
  });

  it('calls fetcher with the correct path and an AbortSignal', () => {
    setup();
    const fetcher = vi.fn(() => new Promise<string>(() => {}));
    act(() =>
      root.render(
        <PeekWindow
          path="notes/npcs/bob.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={fetcher}
        />,
      ),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('notes/npcs/bob.md', expect.any(AbortSignal));
  });
});

// ─── Error States ─────────────────────────────────────────────────────────────

describe('error states', () => {
  it('shows error message on generic fetch failure', async () => {
    setup();
    const onClose = vi.fn();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeRejectedFetcher(new Error('boom'))}
          onClose={onClose}
        />,
      ),
    );
    await act(async () => {});
    const win = document.body.querySelector('.peek-window')!;
    expect(win.querySelector('.peek-error')).not.toBeNull();
    expect(win.querySelector('.peek-error')?.textContent).toContain('boom');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose silently on ENOENT without showing error', async () => {
    setup();
    const onClose = vi.fn();
    const notFound = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    act(() =>
      root.render(
        <PeekWindow
          path="notes/missing.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeRejectedFetcher(notFound)}
          onClose={onClose}
        />,
      ),
    );
    await act(async () => {});
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.body.querySelector('.peek-error')).toBeNull();
  });
});

// ─── makeResolveSrc ───────────────────────────────────────────────────────────

describe('makeResolveSrc', () => {
  it('converts relative path to notes-asset URL with baseDir', () => {
    const resolve = makeResolveSrc('notes/npcs');
    expect(resolve('image.png')).toBe('notes-asset://current/notes/npcs/image.png');
  });

  it('preserves slashes in subfolder image paths', () => {
    const resolve = makeResolveSrc('notes/npcs');
    expect(resolve('subfolder/portrait.png')).toBe(
      'notes-asset://current/notes/npcs/subfolder/portrait.png',
    );
  });

  it('passes through notes-asset:// URLs unchanged', () => {
    const resolve = makeResolveSrc('notes/npcs');
    const url = 'notes-asset://current/notes/npcs/face.jpg';
    expect(resolve(url)).toBe(url);
  });

  it('passes through https:// URLs unchanged', () => {
    const resolve = makeResolveSrc('notes');
    const url = 'https://example.com/image.png';
    expect(resolve(url)).toBe(url);
  });

  it('passes through data: URLs unchanged', () => {
    const resolve = makeResolveSrc('notes');
    const url = 'data:image/png;base64,xyz';
    expect(resolve(url)).toBe(url);
  });

  it('passes through absolute paths unchanged', () => {
    const resolve = makeResolveSrc('notes');
    expect(resolve('/abs/path.png')).toBe('/abs/path.png');
  });

  it('passes through file: URLs unchanged', () => {
    const resolve = makeResolveSrc('notes');
    const url = 'file:///tmp/x.png';
    expect(resolve(url)).toBe(url);
  });
});

// ─── Close Behavior ───────────────────────────────────────────────────────────

describe('close behavior', () => {
  it('calls onClose when close button is clicked', async () => {
    setup();
    const onClose = vi.fn();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
          onClose={onClose}
        />,
      ),
    );
    const btn = document.body.querySelector('.peek-close') as HTMLButtonElement;
    act(() => btn.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onPin when close button is clicked', async () => {
    setup();
    const onPin = vi.fn();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
          onPin={onPin}
        />,
      ),
    );
    const btn = document.body.querySelector('.peek-close') as HTMLButtonElement;
    act(() => btn.click());
    expect(onPin).not.toHaveBeenCalled();
  });

  it('removes portal div from body on unmount', () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    expect(document.body.querySelector('.peek-window')).not.toBeNull();
    act(() => root.unmount());
    expect(document.body.querySelector('.peek-window')).toBeNull();
  });
});

// ─── Pin Behavior ─────────────────────────────────────────────────────────────

describe('pin behavior', () => {
  it('clicking the body adds .is-pinned when not yet pinned', async () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
        />,
      ),
    );
    await act(async () => {});
    const body = document.body.querySelector('.peek-body') as HTMLDivElement;
    act(() => body.click());
    expect(document.body.querySelector('.peek-window')?.classList.contains('is-pinned')).toBe(true);
  });

  it('clicking the body calls onPin', async () => {
    setup();
    const onPin = vi.fn();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
          onPin={onPin}
        />,
      ),
    );
    await act(async () => {});
    act(() => (document.body.querySelector('.peek-body') as HTMLDivElement).click());
    expect(onPin).toHaveBeenCalledOnce();
  });

  it('second body click does not fire onPin again', async () => {
    setup();
    const onPin = vi.fn();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
          onPin={onPin}
        />,
      ),
    );
    await act(async () => {});
    const body = document.body.querySelector('.peek-body') as HTMLDivElement;
    act(() => body.click());
    act(() => body.click());
    expect(onPin).toHaveBeenCalledOnce();
  });
});

// ─── Positioning ──────────────────────────────────────────────────────────────

describe('positioning', () => {
  it('opens to the RIGHT when the right side has more room', () => {
    // innerWidth defaults to 1024 in happy-dom; anchor sits near the left edge
    // so spaceRight (874) is far larger than spaceLeft (50).
    setup();
    const anchorRect = makeAnchorRect({ left: 50, right: 150, top: 100, bottom: 120 });
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={anchorRect}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    expect(parseInt(win.style.left)).toBe(anchorRect.right); // flush against the link, no gap
    expect(parseInt(win.style.top)).toBe(Math.max(12, anchorRect.top));
  });

  it('opens to the LEFT when the left side has more room', () => {
    // Anchor sits near the right edge of a 1024px-wide viewport, so
    // spaceLeft (900) is far larger than spaceRight (24).
    setup();
    const anchorRect = makeAnchorRect({ left: 900, right: 1000, top: 200, bottom: 220 });
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={anchorRect}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    expect(parseInt(win.style.left)).toBe(anchorRect.left - 480); // flush against the link, no gap
  });

  it('never opens below the link', () => {
    setup();
    const anchorRect = makeAnchorRect({ left: 400, right: 500, top: 300, bottom: 320 });
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={anchorRect}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    expect(parseInt(win.style.top)).not.toBe(anchorRect.bottom + 12);
    expect(parseInt(win.style.top)).toBe(Math.max(12, anchorRect.top));
  });

  it('clamps within the viewport', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
    setup();
    // spaceRight (450) > spaceLeft (50) so it opens right, but a flush right
    // placement (left: 150) would overflow a 600px-wide viewport and must clamp.
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect({ left: 50, right: 150, top: 120, bottom: 140 })}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );
    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    const left = parseInt(win.style.left);
    expect(left).toBe(108); // 600 - 480 - 12
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left + 480).toBeLessThanOrEqual(600 - 12);
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  });
});

// ─── Drag ─────────────────────────────────────────────────────────────────────

describe('drag', () => {
  it('moves window when dragging header while pinned', async () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect({ left: 100, bottom: 120 })}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
        />,
      ),
    );
    await act(async () => {});

    // Pin first
    act(() => (document.body.querySelector('.peek-body') as HTMLElement).click());

    const header = document.body.querySelector('.peek-header') as HTMLElement;
    act(() =>
      header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })),
    );
    act(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 30 }),
      ),
    );
    act(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));

    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    // Default anchorRect (left:100, right:200, top:100) has more room on the
    // right (824px) than the left (100px), so it opens flush right at left:200,
    // top-aligned at top:100.
    expect(parseInt(win.style.left)).toBe(250); // 200 + 50
    expect(parseInt(win.style.top)).toBe(130); // 100 + 30
  });

  it('does not drag when window is not pinned', () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect({ left: 100, bottom: 120 })}
          stackDepth={0}
          fetcher={makeNeverFetcher()}
        />,
      ),
    );

    const header = document.body.querySelector('.peek-header') as HTMLElement;
    act(() =>
      header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 })),
    );
    act(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 30 }),
      ),
    );

    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    expect(parseInt(win.style.left)).toBe(200);
    expect(parseInt(win.style.top)).toBe(100);
  });

  it('does not drag when mousedown is on the close button', async () => {
    setup();
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect({ left: 100, bottom: 120 })}
          stackDepth={0}
          fetcher={makeResolvedFetcher()}
        />,
      ),
    );
    await act(async () => {});

    // Pin
    act(() => (document.body.querySelector('.peek-body') as HTMLElement).click());

    const closeBtn = document.body.querySelector('.peek-close') as HTMLElement;
    act(() =>
      closeBtn.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }),
      ),
    );
    act(() =>
      document.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 30 }),
      ),
    );

    const win = document.body.querySelector('.peek-window') as HTMLDivElement;
    expect(parseInt(win.style.left)).toBe(200);
  });
});

// ─── Abort / Cleanup ─────────────────────────────────────────────────────────

describe('abort and cleanup', () => {
  it('aborts in-flight fetch when component unmounts', () => {
    setup();
    let capturedSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_path: string, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<string>(() => {});
    });
    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={fetcher}
        />,
      ),
    );
    expect(capturedSignal?.aborted).toBe(false);
    act(() => root.unmount());
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('does not trigger React warnings when fetcher resolves after unmount', async () => {
    setup();
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let resolve!: (value: string) => void;
    const fetcher = vi.fn(
      (_path: string, _signal: AbortSignal) =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    act(() =>
      root.render(
        <PeekWindow
          path="notes/foo.md"
          anchorRect={makeAnchorRect()}
          stackDepth={0}
          fetcher={fetcher}
        />,
      ),
    );

    act(() => root.unmount());

    // Resolve after unmount — should not cause any React warnings
    await act(async () => {
      resolve('# Hello');
    });

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('unmounted'));
    warnSpy.mockRestore();
  });
});
