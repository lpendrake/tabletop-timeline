// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CampaignLoadOverlay } from '../campaign-load-overlay';

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

const defaultProps = {
  result: 'idle' as const,
  progress: { percentage: 0, taskName: '' },
  errorMessage: null,
  fileCount: 0,
  onDismissNotification: () => {},
};

describe('CampaignLoadOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  it('renders nothing when result is idle', () => {
    setup();
    act(() => root.render(<CampaignLoadOverlay {...defaultProps} />));
    expect(container.children).toHaveLength(0);
  });

  it('renders the loading screen with progress bar when result is loading', () => {
    setup();
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="loading"
          progress={{ percentage: 40, taskName: 'Building entity index' }}
        />,
      ),
    );
    expect(container.textContent).toContain('Loading Your Universe');
    const fill = container.querySelector('.campaign-load-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(container.textContent).toContain('Building entity index');
  });

  it('shows the mask overlay during loading', () => {
    setup();
    act(() => root.render(<CampaignLoadOverlay {...defaultProps} result="loading" />));
    expect(container.querySelector('.campaign-load-mask')).not.toBeNull();
  });

  it('transitions to success notification after load completes', async () => {
    setup();
    act(() => root.render(<CampaignLoadOverlay {...defaultProps} result="loading" />));
    act(() =>
      root.render(<CampaignLoadOverlay {...defaultProps} result="success" fileCount={42} />),
    );
    // Advance past mask-fading delay (200ms) — in happy-dom from.width=0 so
    // the FLIP guard immediately sets phase to 'notification'
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(container.textContent).toContain('Campaign loaded');
    expect(container.textContent).toContain('42 files indexed');
    expect(container.querySelector('.campaign-load-mask')).toBeNull();
  });

  it('mask is fading but box still shows loading content before morph', () => {
    setup();
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="loading"
          progress={{ percentage: 100, taskName: 'Done' }}
        />,
      ),
    );
    // Transition to success — mask-fading phase starts, timer not yet fired
    act(() => root.render(<CampaignLoadOverlay {...defaultProps} result="success" />));
    expect(container.querySelector('.campaign-load-mask--fading')).not.toBeNull();
    expect(container.textContent).toContain('Loading Your Universe');
  });

  it('auto-dismisses success notification after 5 seconds', async () => {
    setup();
    const onDismiss = vi.fn();
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="loading"
          onDismissNotification={onDismiss}
        />,
      ),
    );
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="success"
          onDismissNotification={onDismiss}
        />,
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(200); // mask-fading → morphing/notification
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5000); // auto-dismiss timer
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders error notification with message when result is error', () => {
    setup();
    act(() =>
      root.render(
        <CampaignLoadOverlay {...defaultProps} result="error" errorMessage="disk full" />,
      ),
    );
    expect(container.querySelector('.campaign-load-box--notification')).not.toBeNull();
    expect(container.textContent).toContain('disk full');
    expect(container.querySelector('.campaign-load-mask')).toBeNull();
  });

  it('renders fallback message when error has no message', () => {
    setup();
    act(() =>
      root.render(<CampaignLoadOverlay {...defaultProps} result="error" errorMessage={null} />),
    );
    expect(container.textContent).toContain('Failed to load campaign');
  });

  it('calls onDismissNotification when error notification dismiss is clicked', () => {
    setup();
    const onDismiss = vi.fn();
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="error"
          errorMessage="oops"
          onDismissNotification={onDismiss}
        />,
      ),
    );
    act(() => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has a progress bar with aria attributes', () => {
    setup();
    act(() =>
      root.render(
        <CampaignLoadOverlay
          {...defaultProps}
          result="loading"
          progress={{ percentage: 55, taskName: '' }}
        />,
      ),
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-valuenow')).toBe('55');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
  });
});
