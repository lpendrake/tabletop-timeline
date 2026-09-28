import { describe, it, expect } from 'vitest';
import { createCalendar, golarionSpec } from '../../../../shared/calendar';
import { emptyBuffer } from '../domain';
import { bufferEpochSeconds } from '../domain/buffer-epoch-seconds';

const cal = createCalendar(golarionSpec);

describe('bufferEpochSeconds', () => {
  it('parses the buffer date against the given calendar', () => {
    const buffer = { ...emptyBuffer(), date: '4726-05-04T09:30' };
    const result = bufferEpochSeconds(buffer, cal);
    expect(result).toBe(cal.toEpochSeconds(cal.tryParse('4726-05-04T09:30')!));
  });

  it('trims surrounding whitespace before parsing', () => {
    const buffer = { ...emptyBuffer(), date: '  4726-05-04T09:30  ' };
    expect(bufferEpochSeconds(buffer, cal)).toBe(
      bufferEpochSeconds({ ...buffer, date: '4726-05-04T09:30' }, cal),
    );
  });

  it('returns null for an unparseable date', () => {
    const buffer = { ...emptyBuffer(), date: 'not a date' };
    expect(bufferEpochSeconds(buffer, cal)).toBeNull();
  });

  it('returns null for an empty date', () => {
    expect(bufferEpochSeconds(emptyBuffer(), cal)).toBeNull();
  });
});
