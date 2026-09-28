import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSaveQueue } from '../view-order-save-queue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createSaveQueue', () => {
  it('debounces: only the last scheduled value is saved after the delay', () => {
    const save = vi.fn();
    const queue = createSaveQueue(save, 300);

    queue.schedule('a');
    vi.advanceTimersByTime(100);
    queue.schedule('b');
    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
  });

  it('flush writes immediately and cancels the pending timer', () => {
    const save = vi.fn();
    const queue = createSaveQueue(save, 300);

    queue.schedule('a');
    queue.flush();
    expect(save).toHaveBeenCalledWith('a');

    save.mockClear();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('flush is a no-op when nothing is pending', () => {
    const save = vi.fn();
    createSaveQueue(save, 300).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
