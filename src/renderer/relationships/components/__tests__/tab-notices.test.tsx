// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { NoticeView } from '../tab-notices';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('NoticeView', () => {
  it('NoticeView renders the empty and no-match notices', () => {
    act(() => root.render(<NoticeView notice={{ kind: 'empty-track' }} trackName="Tags" />));
    expect(container.textContent).toBe(
      'No Tags changes yet. Type / in an event or note and choose Relationships › Tags.',
    );
    expect(container.querySelector('.rel-empty code')?.textContent).toBe('/');

    act(() =>
      root.render(
        <NoticeView notice={{ kind: 'no-match', message: 'Nothing matches' }} trackName="Tags" />,
      ),
    );
    expect(container.querySelector('.rel-empty')?.textContent).toBe('Nothing matches');

    act(() => root.render(<NoticeView notice={null} trackName="Tags" />));
    expect(container.innerHTML).toBe('');
  });
});
