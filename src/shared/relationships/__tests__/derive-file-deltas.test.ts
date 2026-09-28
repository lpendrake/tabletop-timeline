import { describe, it, expect } from 'vitest';

import { deltasForFile, ledgerKey, EMPTY_TRACK_LIBRARY } from '../index.js';

const A = 'a1b2';
const C = 'c3d4';

function repChangeDirective(
  holder: string,
  observer: string,
  amount: number,
  reason: string,
): string {
  return `{{rp01.change Rep change: {amount:${amount}} {observer:[[${observer}]]} rep for {holder:[[${holder}]]} — {reason:${reason}}}}`;
}

function repSetDirective(holder: string, observer: string, value: number, reason: string): string {
  return `{{rp01.set Rep set: {holder:[[${holder}]]}'s rep with {observer:[[${observer}]]} is {value:${value}} — {reason:${reason}}}}`;
}

function tagsGainsDirective(
  holder: string,
  observer: string,
  option: string,
  reason: string,
): string {
  return `{{tg01.gains {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:${reason}}}}`;
}

const ctx = { library: EMPTY_TRACK_LIBRARY };

describe('deltasForFile: direct delta', () => {
  it('produces one delta keyed by (holder, observer, track), undated on a note', () => {
    const result = deltasForFile(
      { path: 'notes/n1.md', source: repSetDirective(A, C, 5, 'gift'), isEvent: false },
      ctx,
    );

    const key = ledgerKey(A, C, 'rp01');
    expect(result.ledgers.get(key)).toEqual([
      expect.objectContaining({ op: 'set', value: 5, at: null }),
    ]);
    expect(result.invalid).toHaveLength(0);
    expect(result.referencedNoteIds).toEqual(new Set([A, C]));
  });
});

describe('deltasForFile: mirrored delta for a Symmetrical (mutual) option', () => {
  it('adds the direct delta and a flagged mirror on the paired ledger', () => {
    const result = deltasForFile(
      {
        path: 'notes/n1.md',
        source: tagsGainsDirective(A, C, 'married', 'wedding'),
        isEvent: false,
      },
      ctx,
    );

    const direct = result.ledgers.get(ledgerKey(A, C, 'tg01'));
    const mirror = result.ledgers.get(ledgerKey(C, A, 'tg01'));

    expect(direct).toEqual([expect.objectContaining({ op: 'add', key: 'married' })]);
    expect(direct?.[0].mirrored).toBeUndefined();
    expect(mirror).toEqual([
      expect.objectContaining({ op: 'add', key: 'married', mirrored: true }),
    ]);
  });

  it('does not mirror a non-mutual option', () => {
    const result = deltasForFile(
      { path: 'notes/n1.md', source: tagsGainsDirective(A, C, 'member', 'joined'), isEvent: false },
      ctx,
    );

    expect(result.ledgers.get(ledgerKey(C, A, 'tg01'))).toBeUndefined();
  });
});

describe('deltasForFile: note vs event dating', () => {
  it('a note directive is undated (at: null)', () => {
    const result = deltasForFile(
      { path: 'notes/n1.md', source: repSetDirective(A, C, 3, 'gift'), isEvent: false },
      ctx,
    );
    expect(result.ledgers.get(ledgerKey(A, C, 'rp01'))?.[0].at).toBeNull();
  });

  it('an event directive gets `at` from epochSeconds', () => {
    const result = deltasForFile(
      {
        path: 'timeline/e1.md',
        source: repChangeDirective(A, C, -2, 'attacked'),
        isEvent: true,
        epochSeconds: 1000,
      },
      ctx,
    );
    expect(result.ledgers.get(ledgerKey(A, C, 'rp01'))?.[0].at).toBe(1000);
  });

  it('an event with no date produces no deltas and an invalid entry', () => {
    const result = deltasForFile(
      {
        path: 'timeline/e1.md',
        source: repChangeDirective(A, C, -2, 'attacked'),
        isEvent: true,
        epochSeconds: null,
      },
      ctx,
    );
    expect(result.ledgers.size).toBe(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].messages.join(' ')).toMatch(/no date/i);
  });
});

describe('deltasForFile: unfinished directives are skipped', () => {
  it('produces no deltas and no invalid entry for a directive missing a required role', () => {
    const source =
      "{{rp01.set Rep set: {holder:}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:}}}";
    const result = deltasForFile({ path: 'notes/n1.md', source, isEvent: false }, ctx);

    expect(result.ledgers.size).toBe(0);
    expect(result.invalid).toHaveLength(0);
  });
});

describe('deltasForFile: notes-vs-events rule enforced via undated', () => {
  it('rejects Change (adjust) in a note', () => {
    const result = deltasForFile(
      { path: 'notes/n1.md', source: repChangeDirective(A, C, 1, 'x'), isEvent: false },
      ctx,
    );
    expect(result.ledgers.size).toBe(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].messages.join(' ')).toMatch(/no order/i);
  });

  it('allows Change (adjust) in an event', () => {
    const result = deltasForFile(
      {
        path: 'timeline/e1.md',
        source: repChangeDirective(A, C, 1, 'x'),
        isEvent: true,
        epochSeconds: 1000,
      },
      ctx,
    );
    expect(result.ledgers.get(ledgerKey(A, C, 'rp01'))).toEqual([
      expect.objectContaining({ op: 'adjust', by: 1 }),
    ]);
  });
});

describe('deltasForFile: undated events and unfinished drafts', () => {
  const draft =
    '{{rp01.change Rep change: {amount:} {observer:[[a1b2]]} rep for {holder:} — {reason:}}}';
  const undated = { path: 'timeline/e1.md', isEvent: true, epochSeconds: null };

  it('stays silent about an unfinished draft in an undated event', () => {
    const result = deltasForFile({ ...undated, source: draft }, ctx);
    expect(result.invalid).toHaveLength(0);
  });

  it('still reports a finished directive in an undated event, with its trackId', () => {
    const result = deltasForFile({ ...undated, source: repChangeDirective(A, C, -2, 'x') }, ctx);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].trackId).toBe('rp01');
    expect(result.invalid[0].messages).toEqual(['Event has no date']);
  });
});
