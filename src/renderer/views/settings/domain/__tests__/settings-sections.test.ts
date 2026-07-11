import { describe, it, expect } from 'vitest';
import { SETTINGS_SECTIONS } from '../settings-sections';

describe('SETTINGS_SECTIONS', () => {
  it('contains exactly five sections in order', () => {
    expect(SETTINGS_SECTIONS).toHaveLength(5);
  });

  it('has General as the first section', () => {
    expect(SETTINGS_SECTIONS[0]).toEqual({ id: 'general', label: 'General' });
  });

  it('has Timeline as the second section', () => {
    expect(SETTINGS_SECTIONS[1]).toEqual({ id: 'timeline', label: 'Timeline' });
  });

  it('has Theme as the third section', () => {
    expect(SETTINGS_SECTIONS[2]).toEqual({ id: 'theme', label: 'Theme' });
  });

  it('has Templates as the fourth section', () => {
    expect(SETTINGS_SECTIONS[3]).toEqual({ id: 'templates', label: 'Templates' });
  });

  it('has Keybindings as the fifth section', () => {
    expect(SETTINGS_SECTIONS[4]).toEqual({ id: 'keybindings', label: 'Keybindings' });
  });
});
