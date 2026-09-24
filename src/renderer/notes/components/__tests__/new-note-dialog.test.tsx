// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { NewNoteDialog } from '../new-note-dialog';
import type { CreateNoteResult } from '../../create-note';

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

const FOLDERS = [
  'npcs',
  'factions',
  'factions/the-house-of-storms',
  'factions/the-house-of-storms/spies',
];

function createdResult(title: string, folder: string): CreateNoteResult {
  return {
    status: 'created',
    note: { id: 'new1', folder, filename: `${title}.md`, title, frontmatter: '', body: '' },
  };
}

function render(props: Partial<React.ComponentProps<typeof NewNoteDialog>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const create =
    props.create ??
    vi.fn((input: { title: string; folder: string }) =>
      Promise.resolve(createdResult(input.title, input.folder)),
    );
  act(() => {
    root.render(
      <NewNoteDialog
        initialTitle={props.initialTitle ?? ''}
        folders={props.folders ?? FOLDERS}
        initialFolder={props.initialFolder ?? ''}
        create={create}
        onSubmit={props.onSubmit ?? onSubmit}
        onCancel={props.onCancel ?? onCancel}
      />,
    );
  });
  return { onSubmit, onCancel, create };
}

function titleInput(): HTMLInputElement {
  return container.querySelector('#new-note-title-input') as HTMLInputElement;
}

function folderInput(): HTMLInputElement {
  return container.querySelector('.searchable-picker-input') as HTMLInputElement;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('NewNoteDialog', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('title is pre-filled from the selection', () => {
    render({ initialTitle: 'Captain Varr' });
    expect(titleInput().value).toBe('Captain Varr');
  });

  it('typing storm/spies in the folder box and Enter submits with that folder', async () => {
    const { onSubmit, create } = render({ initialTitle: 'Captain Varr', initialFolder: '' });

    act(() => {
      fireEvent.change(folderInput(), { target: { value: 'storm/spies' } });
    });
    await act(async () => {
      fireEvent.keyDown(folderInput(), { key: 'Enter' });
    });
    await flush();

    expect(create).toHaveBeenCalledWith({
      title: 'Captain Varr',
      folder: 'factions/the-house-of-storms/spies',
    });
    expect(onSubmit).toHaveBeenCalledWith(
      createdResult('Captain Varr', 'factions/the-house-of-storms/spies').note,
    );
  });

  it('Enter in the title submits with the default folder', async () => {
    const { onSubmit, create } = render({ initialTitle: 'Captain Varr', initialFolder: 'npcs' });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();

    expect(create).toHaveBeenCalledWith({ title: 'Captain Varr', folder: 'npcs' });
    expect(onSubmit).toHaveBeenCalledWith(createdResult('Captain Varr', 'npcs').note);
  });

  it('the dialog shows the initial folder as chosen', () => {
    render({ initialFolder: 'factions/the-house-of-storms/spies' });
    const label = container.querySelector('.new-note-current-folder');
    expect(label?.textContent).toContain('factions/the-house-of-storms/spies');
  });

  it('shows root label when the initial folder is the root', () => {
    render({ initialFolder: '' });
    const label = container.querySelector('.new-note-current-folder');
    expect(label?.textContent).toContain('notes/ (root)');
  });

  it('Escape cancels and does not reach a document capture listener', () => {
    const documentHandler = vi.fn();
    document.addEventListener('keydown', documentHandler, { capture: true });

    const { onCancel } = render();

    act(() => {
      fireEvent.keyDown(titleInput(), { key: 'Escape' });
    });

    document.removeEventListener('keydown', documentHandler, { capture: true });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(documentHandler).not.toHaveBeenCalled();
  });

  it('an empty title does not submit', async () => {
    const { onSubmit, create } = render({ initialTitle: '' });

    act(() => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });

    expect(create).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('.new-note-error')).not.toBeNull();
  });

  it('clicking a folder row sets the folder without submitting', () => {
    const { onSubmit } = render({ initialTitle: 'Captain Varr', initialFolder: '' });

    act(() => {
      fireEvent.change(folderInput(), { target: { value: 'npcs' } });
    });

    const row = Array.from(container.querySelectorAll('.searchable-picker-row')).find(
      (el) => el.textContent === 'npcs',
    ) as HTMLElement;
    expect(row).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(row);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    const label = container.querySelector('.new-note-current-folder');
    expect(label?.textContent).toContain('npcs');
  });

  it('clicking the backdrop cancels', () => {
    const { onCancel } = render();
    const overlay = container.querySelector('.new-note-overlay') as HTMLElement;

    act(() => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: overlay, writable: false });
      overlay.dispatchEvent(event);
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows an already-exists warning with a hoverable link and stays open', async () => {
    const create = vi.fn().mockResolvedValue({
      status: 'exists',
      existing: { path: 'npcs/bob.md', id: 'bob1', title: 'Bob' },
    });
    const { onSubmit, onCancel } = render({
      initialTitle: 'Bob',
      initialFolder: 'npcs',
      create,
    });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    // The dialog is still mounted/open — nothing has torn it down.
    expect(container.querySelector('.new-note-overlay')).not.toBeNull();

    const warning = container.querySelector('.new-note-conflict');
    expect(warning?.textContent).toContain('A note called "Bob" already exists in npcs:');

    // The link carries the same markup the editor's wiki-links use, so the
    // global peek hover machinery (wired up separately via initPeek) can
    // recognize and preview it — see peek/__tests__/stack.test.ts and
    // peek/__tests__/peek-hover-integration.test.tsx for the hover behavior
    // itself.
    const link = container.querySelector('.new-note-conflict-link') as HTMLElement;
    expect(link).toBeTruthy();
    expect(link.textContent).toBe('Bob');
    expect(link.classList.contains('cm-note-link')).toBe(true);
    expect(link.dataset.noteId).toBe('bob1');
  });

  it('an existing note without an id shows its path without a hover link', async () => {
    const create = vi.fn().mockResolvedValue({
      status: 'exists',
      existing: { path: 'npcs/bob.md', id: null, title: 'Bob' },
    });
    render({ initialTitle: 'Bob', initialFolder: 'npcs', create });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();

    expect(container.querySelector('.new-note-conflict-link')).toBeNull();
    const path = container.querySelector('.new-note-conflict-path');
    expect(path?.textContent).toBe('npcs/bob.md');
  });

  it('changing the title clears the warning; Back refocuses the title', async () => {
    const create = vi.fn().mockResolvedValue({
      status: 'exists',
      existing: { path: 'npcs/bob.md', id: 'bob1', title: 'Bob' },
    });
    render({ initialTitle: 'Bob', initialFolder: 'npcs', create });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();
    expect(container.querySelector('.new-note-conflict')).not.toBeNull();

    act(() => {
      fireEvent.change(titleInput(), { target: { value: 'Bob 2' } });
    });
    expect(container.querySelector('.new-note-conflict')).toBeNull();

    // Re-trigger the warning, then dismiss it with Back.
    await act(async () => {
      fireEvent.change(titleInput(), { target: { value: 'Bob' } });
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();
    expect(container.querySelector('.new-note-conflict')).not.toBeNull();

    const backBtn = container.querySelector('.new-note-back-btn') as HTMLButtonElement;
    act(() => {
      fireEvent.click(backBtn);
    });
    expect(container.querySelector('.new-note-conflict')).toBeNull();
    expect(document.activeElement).toBe(titleInput());
  });

  it('a second submit with a new title creates and resolves', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'exists',
        existing: { path: 'npcs/bob.md', id: 'bob1', title: 'Bob' },
      })
      .mockResolvedValueOnce(createdResult('Bob 2', 'npcs'));
    const { onSubmit } = render({ initialTitle: 'Bob', initialFolder: 'npcs', create });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();
    expect(container.querySelector('.new-note-conflict')).not.toBeNull();

    act(() => {
      fireEvent.change(titleInput(), { target: { value: 'Bob 2' } });
    });
    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(2, { title: 'Bob 2', folder: 'npcs' });
    expect(onSubmit).toHaveBeenCalledWith(createdResult('Bob 2', 'npcs').note);
    expect(container.querySelector('.new-note-conflict')).toBeNull();
  });

  it("a stray Enter with the same title/folder doesn't resubmit while the warning is shown", async () => {
    const create = vi.fn().mockResolvedValue({
      status: 'exists',
      existing: { path: 'npcs/bob.md', id: 'bob1', title: 'Bob' },
    });
    render({ initialTitle: 'Bob', initialFolder: 'npcs', create });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a create error is shown inline and the dialog stays open', async () => {
    const create = vi.fn().mockRejectedValue(new Error('disk full'));
    const { onSubmit, onCancel } = render({ initialTitle: 'Bob', initialFolder: 'npcs', create });

    await act(async () => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(container.querySelector('.new-note-overlay')).not.toBeNull();
    expect(container.querySelector('.new-note-error')?.textContent).toBe('disk full');
  });
});
