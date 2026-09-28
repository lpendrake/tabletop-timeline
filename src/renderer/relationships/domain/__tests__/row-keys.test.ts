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
  it('is just the row key', () => {
    expect(outerRowStateKey(outer('aaaa'))).toBe('aaaa');
  });
});

describe('innerRowStateKey', () => {
  it('scopes the same inner entity id to different keys under different outer rows', () => {
    const in1 = inner('bbbb');
    expect(innerRowStateKey(outer('aaaa'), in1)).not.toBe(innerRowStateKey(outer('cccc'), in1));
  });

  it('is stable for the same outer/inner pair', () => {
    const o = outer('aaaa');
    const i = inner('bbbb');
    expect(innerRowStateKey(o, i)).toBe(innerRowStateKey(o, i));
  });
});
