// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { OptionChip } from '../../../domain/categorical';
import { OptionChipView } from '../option-chip';

describe('OptionChipView', () => {
  it('renders the label with the option colour as a custom property', () => {
    const chip: OptionChip = { key: 'member', label: 'Member', colour: 'var(--theme-accent-gold)' };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<OptionChipView chip={chip} />));
    const el = container.querySelector<HTMLElement>('.rel-tag-chip')!;
    expect(el.textContent).toBe('Member');
    expect(el.style.getPropertyValue('--rel-tag-colour')).toBe('var(--theme-accent-gold)');
    act(() => root.unmount());
  });
});
