// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { NewNoteDialog } from '../new-note-dialog';

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

function render(props: Partial<React.ComponentProps<typeof NewNoteDialog>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  act(() => {
    root.render(
      <NewNoteDialog
        initialTitle={props.initialTitle ?? ''}
        folders={props.folders ?? FOLDERS}
        initialFolder={props.initialFolder ?? ''}
        onSubmit={props.onSubmit ?? onSubmit}
        onCancel={props.onCancel ?? onCancel}
      />,
    );
  });
  return { onSubmit, onCancel };
}

function titleInput(): HTMLInputElement {
  return container.querySelector('#new-note-title-input') as HTMLInputElement;
}

function folderInput(): HTMLInputElement {
  return container.querySelector('.searchable-picker-input') as HTMLInputElement;
}

describe('NewNoteDialog', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('title is pre-filled from the selection', () => {
    render({ initialTitle: 'Captain Varr' });
    expect(titleInput().value).toBe('Captain Varr');
  });

  it('typing storm/spies in the folder box and Enter submits with that folder', () => {
    const { onSubmit } = render({ initialTitle: 'Captain Varr', initialFolder: '' });

    act(() => {
      fireEvent.change(folderInput(), { target: { value: 'storm/spies' } });
    });
    act(() => {
      fireEvent.keyDown(folderInput(), { key: 'Enter' });
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Captain Varr',
      folder: 'factions/the-house-of-storms/spies',
    });
  });

  it('Enter in the title submits with the default folder', () => {
    const { onSubmit } = render({ initialTitle: 'Captain Varr', initialFolder: 'npcs' });

    act(() => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Captain Varr', folder: 'npcs' });
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

  it('an empty title does not submit', () => {
    const { onSubmit } = render({ initialTitle: '' });

    act(() => {
      fireEvent.keyDown(titleInput(), { key: 'Enter' });
    });

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
});
