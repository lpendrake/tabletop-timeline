import { describe, it, expect } from 'vitest';
import { outerRowStateKey, innerRowStateKey } from '../row-keys';
import type { OuterRow, InnerRow } from '../group-relationships';

function outer(key: string): OuterRow {
  return { key, entityId: key, children: [] };
}

function inner(key: string): InnerRow {
  return { key, entityId: key, holder: key, observer: key, tracks: [] };
}

describe('outerRowStateKey', () => {
  it('scopes the same entity id to different keys across modes', () => {
    const a = outer('aaaa');
    expect(outerRowStateKey('holder', a)).not.toBe(outerRowStateKey('observer', a));
  });
});

describe('innerRowStateKey', () => {
  it('scopes the same inner entity id to different keys under different outer rows', () => {
    const in1 = inner('bbbb');
    expect(innerRowStateKey('holder', outer('aaaa'), in1)).not.toBe(
      innerRowStateKey('holder', outer('cccc'), in1),
    );
  });

  it('is stable for the same mode/outer/inner triple', () => {
    const o = outer('aaaa');
    const i = inner('bbbb');
    expect(innerRowStateKey('holder', o, i)).toBe(innerRowStateKey('holder', o, i));
  });
});
