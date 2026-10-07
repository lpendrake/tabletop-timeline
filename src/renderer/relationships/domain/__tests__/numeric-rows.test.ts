import { describe, expect, it } from 'vitest';
import { currentValue, type DeltaOp, type Ledger } from '../../../../shared/relationships';
import { formatNumber } from '../row-display';
import { numericRowModel, numericTabModel, tooltipText } from '../numeric-rows';
import { plotRange } from '../plot-scale';
import { scaleColourCss, valueColour } from '../scale-colour';
import { defaultViewOrder } from '../view-order';
import { deriveViewRows, type ViewGroup, type ViewRow } from '../view-rows';
import { noBands, pf2e, tenths, unbounded } from './numeric-fixtures';

const NOW = 1000;
const AS_OF = '12 Lamashan 4725';

function ledgerOf(op: DeltaOp, track = pf2e, observer = 'bbbb'): Ledger {
  return {
    holder: 'aaaa',
    observer,
    track: track.id,
    deltas: [{ ...op, at: null, declaredIn: { path: 'notes/x.md', ordinal: 0 } }],
  };
}

function viewRowFor(ledger: Ledger, track = pf2e): ViewRow {
  const { groups } = deriveViewRows({
    ledgers: [ledger],
    track,
    trackId: track.id,
    holderId: '*',
    now: NOW,
    titleByPath: new Map(),
    labelFor: (id) => id,
    query: '',
    enabledScopes: ['name', 'band'],
    sortMode: 'mine',
    viewOrder: defaultViewOrder(),
  });
  return groups[0].rows[0];
}

function modelFor(row: ViewRow, track = pf2e, asOf: string | null = AS_OF) {
  return numericRowModel(row, track, plotRange(track, [Number(row.value)]), asOf);
}

describe('numeric-rows', () => {
  it('row value and band equal currentValue and labelFor at every PF2E band boundary', () => {
    const values = [-60, -50, -30, -29, -15, -14, -5, -4, 4, 5, 14, 15, 29, 30, 50, 60];
    for (const v of values) {
      const ledger = ledgerOf({ op: 'set', value: v });
      const expected = currentValue(ledger, pf2e, NOW).value;
      const model = modelFor(viewRowFor(ledger));
      expect(model.valueText, `value at ${v}`).toBe(formatNumber(Number(expected)));
      expect(model.bandLabel, `band at ${v}`).toBe(pf2e.labelFor(expected));
      expect(model.colour, `colour at ${v}`).toBe(
        scaleColourCss(valueColour(pf2e, Number(expected))),
      );
    }
    expect(modelFor(viewRowFor(ledgerOf({ op: 'set', value: -60 }))).valueText).toBe('\u221250');
    expect(modelFor(viewRowFor(ledgerOf({ op: 'set', value: 60 }))).valueText).toBe('50');
  });

  it('an adjust of +18 reads as Admired with a line from the start to the dot', () => {
    const model = modelFor(viewRowFor(ledgerOf({ op: 'adjust', by: 18 })));
    expect(model.valueText).toBe('18');
    expect(model.bandLabel).toBe('Admired');
    expect(model.line.left).toBeCloseTo(0.5, 5);
    expect(model.line.width).toBeCloseTo(0.18, 5);
    expect(model.dot).toBeCloseTo(0.68, 5);
    expect(model.lineTooltip).toBe('18 · Admired (+18 from 0)');
    expect(model.dotTooltip).toBe('18 · Admired as of 12 Lamashan 4725');
    expect(tooltipText(model, 'line')).toBe(model.lineTooltip);
    expect(tooltipText(model, 'dot')).toBe(model.dotTooltip);
    expect(model.lastChange).toEqual({
      amount: '+18',
      tone: 'positive',
      dateLabel: 'Undated note',
      text: '+18 Undated note',
    });
  });

  it('an adjust of -16 draws the line leftwards from the start', () => {
    const model = modelFor(viewRowFor(ledgerOf({ op: 'adjust', by: -16 })));
    expect(model.line.left).toBeCloseTo(0.34, 5);
    expect(model.line.width).toBeCloseTo(0.16, 5);
    expect(model.lineTooltip).toBe('\u221216 · Hated (\u221216 from 0)');
    expect(model.valueText).toBe('\u221216');
    expect(model.lastChange?.tone).toBe('negative');
  });

  it('a step-0.1 track shows no floating-point noise', () => {
    const ledger = ledgerOf({ op: 'adjust', by: 0.1 }, tenths);
    ledger.deltas.push({
      op: 'adjust',
      by: 0.1,
      at: null,
      declaredIn: { path: 'notes/x.md', ordinal: 1 },
    });
    const row = viewRowFor(ledger, tenths);
    expect(Number(row.value)).not.toBe(0.3);
    const model = modelFor(row, tenths);
    expect(model.valueText).toBe('0.3');
    expect(model.lineTooltip).toBe('0.3 (+0.2 from 0.1)');
    expect(model.dotTooltip).toBe('0.3 as of 12 Lamashan 4725');
  });

  it('a set as the last change is neutral', () => {
    const model = modelFor(viewRowFor(ledgerOf({ op: 'set', value: 12 })));
    expect(model.lastChange).toMatchObject({ amount: '= 12', tone: 'neutral' });
  });

  it('a row with only future deltas has no last change and no line', () => {
    const ledger = ledgerOf({ op: 'adjust', by: 9 });
    ledger.deltas[0].at = NOW + 1;
    const model = modelFor(viewRowFor(ledger));
    expect(model.lastChange).toBeNull();
    expect(model.valueText).toBe('0');
    expect(model.line.width).toBe(0);
  });

  it('a track without bands has no band label and an accent colour', () => {
    const model = modelFor(
      viewRowFor(ledgerOf({ op: 'adjust', by: 7 }, noBands), noBands),
      noBands,
    );
    expect(model.bandLabel).toBeNull();
    expect(model.colour).toBe('var(--theme-accent-gold)');
    expect(model.lineTooltip).toBe('7 (+7 from 0)');
    expect(model.dotTooltip).toBe('7 as of 12 Lamashan 4725');
  });

  it('the dot tooltip drops the date when there is no as-of label', () => {
    const model = modelFor(viewRowFor(ledgerOf({ op: 'adjust', by: 18 })), pf2e, null);
    expect(model.dotTooltip).toBe('18 · Admired');
  });

  it('the tab model scales to every group, collapsed or not', () => {
    const rowA = viewRowFor(ledgerOf({ op: 'set', value: 3 }, unbounded, 'bbbb'), unbounded);
    const rowB = viewRowFor(ledgerOf({ op: 'set', value: 47 }, unbounded, 'cccc'), unbounded);
    const group = (id: string, row: ViewRow, collapsed: boolean): ViewGroup => ({
      holderId: id,
      label: id,
      listKey: `fx:${id}`,
      collapsed,
      rows: [row],
    });
    const model = numericTabModel(
      unbounded,
      [group('aaaa', rowA, false), group('dddd', rowB, true)],
      AS_OF,
    );
    expect(model.scale.hasBands).toBe(false);
    expect(model.scale.lo).toBeLessThanOrEqual(0);
    expect(model.scale.hi).toBeGreaterThanOrEqual(47);
    expect([...model.rows.keys()].sort()).toEqual([rowA.key, rowB.key].sort());
  });
});
