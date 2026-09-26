// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CardExpansion } from '../card-expansion';
import { serialiseTemplate } from '../../../../shared/relationships/directives/index';
import { pf2eReputationSpec } from '../../../../shared/relationships/system/index';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;

const DIRECTIVE = serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
  amount: '-2',
  observer: '[[a1b2]]',
  holder: '[[c3d4]]',
  reason: 'attacked their warehouse',
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CardExpansion — relationship directives (read-only)', () => {
  it('renders a directive block without the delete cross', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <CardExpansion
          body={`# Ambush\n\n${DIRECTIVE}\n`}
          status="loaded"
          expandsDown={true}
          size={{ width: 400, expandedHeight: 200 }}
          centerX={100}
          onSizeChange={() => {}}
          onResizeDragChange={() => {}}
          relationshipDirectives={{
            library: { custom: [], optionAdditions: {} },
            defaultReason: 'Unspecified',
          }}
        />,
      );
    });

    expect(container.querySelector('.cm-directive')).not.toBeNull();
    expect(container.querySelector('.cm-directive-cross')).toBeNull();
  });
});
