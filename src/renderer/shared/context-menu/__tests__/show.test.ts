// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { showContextMenu } from '../show';

afterEach(() => {
  // Defensive cleanup in case a test fails before close() runs.
  document.body.querySelectorAll('.context-menu').forEach((el) => {
    el.closest('div')?.remove();
  });
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('showContextMenu', () => {
  it('mounts a working menu from a non-React caller and close() removes it', async () => {
    const onSelect = vi.fn();

    let handle: ReturnType<typeof showContextMenu>;
    act(() => {
      handle = showContextMenu([{ kind: 'action', label: 'Do the thing', onSelect }], 50, 60);
    });

    const button = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button.context-menu-item'),
    ).find((b) => b.textContent?.trim() === 'Do the thing');
    expect(button).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(button!);
    });
    await flushMicrotasks();

    expect(onSelect).toHaveBeenCalledTimes(1);
    // Selecting the action closes (and unmounts) the menu automatically.
    expect(document.body.querySelector('.context-menu')).toBeNull();

    // Explicit close() also works and is idempotent to call on an already-closed handle.
    await act(async () => {
      handle!.close();
    });
    await flushMicrotasks();
    expect(document.body.querySelector('.context-menu')).toBeNull();
  });

  it('close() removes the menu without selecting anything', async () => {
    const onSelect = vi.fn();

    let handle: ReturnType<typeof showContextMenu>;
    act(() => {
      handle = showContextMenu([{ kind: 'action', label: 'Delete', onSelect }], 0, 0);
    });

    expect(document.body.querySelector('.context-menu')).not.toBeNull();

    await act(async () => {
      handle!.close();
    });
    await flushMicrotasks();

    expect(document.body.querySelector('.context-menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('passes options through, and existing 3-arg calls still work', async () => {
    // A plain 3-arg call (no options) must still work exactly as before.
    let plainHandle: ReturnType<typeof showContextMenu>;
    act(() => {
      plainHandle = showContextMenu([{ kind: 'action', label: 'Plain', onSelect: vi.fn() }], 5, 5);
    });
    expect(document.body.querySelector('.context-menu')).not.toBeNull();
    await act(async () => {
      plainHandle!.close();
    });
    await flushMicrotasks();

    const onSelect = vi.fn();
    const restoreFocus = vi.fn();
    const onClose = vi.fn();

    act(() => {
      showContextMenu([{ kind: 'action', label: 'Do it', onSelect }], 10, 10, {
        restoreFocus,
        onClose,
        backspaceCloses: true,
      });
    });

    const button = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button.context-menu-item'),
    ).find((b) => b.textContent?.trim() === 'Do it');

    await act(async () => {
      fireEvent.click(button!);
    });
    await flushMicrotasks();

    expect(restoreFocus).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('select');
  });
});
