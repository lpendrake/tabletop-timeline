import { describe, it, expect } from 'vitest';
import {
  ATTITUDE_ID,
  EMPTY_TRACK_LIBRARY,
  RELATIONSHIP_TAGS_ID,
  resolveTrack,
} from '../../../../shared/relationships';
import {
  dropIndicatorClass,
  dropToMove,
  formatDeltaChange,
  formatLastChange,
  historyEntryClasses,
  trackValueLabeller,
} from '../row-display';

describe('row display', () => {
  it('last-change formatter signs adjust amounts and describes set/add/remove', () => {
    const at = '23 Gozran 4725';
    expect(formatLastChange({ delta: { op: 'adjust', by: 2 }, dateLabel: at })).toBe(`+2 ${at}`);
    expect(formatLastChange({ delta: { op: 'adjust', by: -3 }, dateLabel: at })).toBe(`−3 ${at}`);
    expect(formatLastChange({ delta: { op: 'set', value: 40 }, dateLabel: at })).toBe(`= 40 ${at}`);
    expect(formatLastChange({ delta: { op: 'set', value: ['a', 'b'] }, dateLabel: at })).toBe(
      `= a, b ${at}`,
    );
    expect(formatLastChange({ delta: { op: 'add', key: 'ally' }, dateLabel: at })).toBe(
      `+ ally ${at}`,
    );
    expect(formatLastChange({ delta: { op: 'remove', key: 'ally' }, dateLabel: at })).toBe(
      `− ally ${at}`,
    );
  });

  it('resolves rung and option keys through a label resolver', () => {
    const attitude = resolveTrack(ATTITUDE_ID, EMPTY_TRACK_LIBRARY)!;
    const tags = resolveTrack(RELATIONSHIP_TAGS_ID, EMPTY_TRACK_LIBRARY)!;
    expect(formatDeltaChange({ op: 'set', value: 'friendly' })).toBe('= friendly');
    expect(formatDeltaChange({ op: 'set', value: 'friendly' }, trackValueLabeller(attitude))).toBe(
      '= Friendly',
    );
    const label = trackValueLabeller(tags);
    expect(formatDeltaChange({ op: 'add', key: 'business-partner' }, label)).toBe(
      '+ business partner',
    );
    expect(formatDeltaChange({ op: 'remove', key: 'married' }, label)).toBe('− married');
    expect(formatDeltaChange({ op: 'set', value: ['married', 'hates'] }, label)).toBe(
      '= married, hates',
    );
  });

  it('maps hit, dim and future entries to classes', () => {
    expect(historyEntryClasses({ hit: true, applied: true })).toBe('rel-entry is-hit');
    expect(historyEntryClasses({ hit: false, applied: false })).toBe('rel-entry is-dim is-future');
    expect(historyEntryClasses({ hit: null, applied: true })).toBe('rel-entry');
  });

  it('turns a drop position into a row move', () => {
    expect(dropToMove('before', 'x')).toEqual({ before: 'x' });
    expect(dropToMove('after', 'x')).toEqual({ after: 'x' });
  });

  it('maps a drag indicator to its class suffix', () => {
    expect(dropIndicatorClass(null)).toBe('');
    expect(dropIndicatorClass('before')).toBe(' drop-before');
    expect(dropIndicatorClass('after')).toBe(' drop-after');
  });
});
