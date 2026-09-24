// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
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

const CREATED_NOTE = {
  id: 'abcd',
  folder: 'npcs',
  filename: 'captain-varr.md',
  title: 'Captain Varr',
  frontmatter: 'id: abcd\ntitle: Captain Varr',
  body: '# Captain Varr\n\n',
};

describe('showNewNoteDialog', () => {
  it('showNewNoteDialog resolves with the created note and unmounts', async () => {
    const create = vi.fn().mockResolvedValue({ status: 'created', note: CREATED_NOTE });
    let promise: ReturnType<typeof showNewNoteDialog>;
    act(() => {
      promise = showNewNoteDialog({
        initialTitle: 'Captain Varr',
        folders: ['npcs'],
        initialFolder: 'npcs',
        create,
      });
    });

    expect(document.body.querySelector('.new-note-overlay')).not.toBeNull();

    const titleInput = document.body.querySelector('#new-note-title-input') as HTMLInputElement;

    await act(async () => {
      fireEvent.keyDown(titleInput, { key: 'Enter' });
    });
    await flushMicrotasks();

    const result = await promise!;
    expect(create).toHaveBeenCalledWith({ title: 'Captain Varr', folder: 'npcs' });
    expect(result).toEqual(CREATED_NOTE);
    expect(document.body.querySelector('.new-note-overlay')).toBeNull();
  });

  it('resolves null on cancel', async () => {
    const create = vi.fn();
    let promise: ReturnType<typeof showNewNoteDialog>;
    act(() => {
      promise = showNewNoteDialog({ folders: [], initialFolder: '', create });
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
    expect(create).not.toHaveBeenCalled();
    expect(document.body.querySelector('.new-note-overlay')).toBeNull();
  });
});
