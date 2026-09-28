// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({
  holderId: null as string | null,
  entityIndex: [
    { id: 'npc-1', path: 'notes/npcs/sera.md', title: 'Sera', type: 'note' },
    { id: 'npc-2', path: 'notes/npcs/toth.md', title: 'Toth', type: 'note' },
  ],
  setDefaultHolderSpy: vi.fn(),
}));

vi.mock('../../../notes/data', () => ({
  notesData: {
    getEntityIndex: () => Promise.resolve(state.entityIndex),
  },
}));

vi.mock('../../../relationships/data', () => ({
  relationshipsData: {
    getDefaultHolder: () => Promise.resolve(state.holderId),
    setDefaultHolder: (id: string | null) => {
      state.setDefaultHolderSpy(id);
      state.holderId = id;
      return Promise.resolve();
    },
  },
}));

vi.mock('../default-view-settings-data', () => ({
  defaultViewSettingsData: {
    getCampaignDefaultView: () => Promise.resolve(null),
    setCampaignDefaultView: vi.fn(),
  },
}));

import { GeneralSection } from '../general-section';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.holderId = null;
  state.setDefaultHolderSpy.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('GeneralSection — Default Reputation Holder', () => {
  it('picks, shows and clears the Default Reputation Holder', async () => {
    act(() => {
      root.render(
        <GeneralSection activeCampaign={{ id: 'c1', name: 'C', path: '/camp' } as never} />,
      );
    });
    await flush();

    expect(container.textContent).toContain('None');

    const chooseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Choose…',
    )!;
    fireEvent.click(chooseBtn);
    await flush();

    const input = container.querySelector('.searchable-picker-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'Sera' } });
    await flush();

    const row = container.querySelector('.searchable-picker-row') as HTMLElement;
    fireEvent.mouseDown(row);
    await flush();

    expect(state.setDefaultHolderSpy).toHaveBeenCalledWith('npc-1');
    expect(container.textContent).toContain('Sera');

    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear',
    )!;
    fireEvent.click(clearBtn);
    await flush();

    expect(state.setDefaultHolderSpy).toHaveBeenCalledWith(null);
    expect(container.textContent).toContain('None');
  });

  it('Relationships is selectable as the default view', async () => {
    act(() => {
      root.render(
        <GeneralSection activeCampaign={{ id: 'c1', name: 'C', path: '/camp' } as never} />,
      );
    });
    await flush();

    const select = container.querySelector('#general-default-view') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('relationships');

    fireEvent.change(select, { target: { value: 'relationships' } });
    await flush();
    expect(select.value).toBe('relationships');
  });
});
