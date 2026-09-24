// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { showNewNoteDialog } from '../show-new-note-dialog';

afterEach(() => {
  document.body.querySelectorAll('.new-note-overlay').forEach((el) => {
    el.closest('div')?.remove();
  });
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('showNewNoteDialog', () => {
  it('showNewNoteDialog resolves with the result and unmounts', async () => {
    let promise: ReturnType<typeof showNewNoteDialog>;
    act(() => {
      promise = showNewNoteDialog({
        initialTitle: 'Captain Varr',
        folders: ['npcs'],
        initialFolder: 'npcs',
      });
    });

    expect(document.body.querySelector('.new-note-overlay')).not.toBeNull();

    const titleInput = document.body.querySelector('#new-note-title-input') as HTMLInputElement;

    await act(async () => {
      fireEvent.keyDown(titleInput, { key: 'Enter' });
    });
    await flushMicrotasks();

    const result = await promise!;
    expect(result).toEqual({ title: 'Captain Varr', folder: 'npcs' });
    expect(document.body.querySelector('.new-note-overlay')).toBeNull();
  });

  it('resolves null on cancel', async () => {
    let promise: ReturnType<typeof showNewNoteDialog>;
    act(() => {
      promise = showNewNoteDialog({ folders: [], initialFolder: '' });
    });

    const overlay = document.body.querySelector('.new-note-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();

    await act(async () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: overlay, writable: false });
      overlay.dispatchEvent(event);
    });
    await flushMicrotasks();

    const result = await promise!;
    expect(result).toBeNull();
    expect(document.body.querySelector('.new-note-overlay')).toBeNull();
  });
});
