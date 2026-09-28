/**
 * Debounced-save queue used by `useRelationships` to persist view-order
 * changes without writing on every keystroke/drag frame. Non-React IO
 * scheduling logic — named and testable independent of the hook, alongside
 * `view-order-data.ts`.
 */

export interface SaveQueue<T> {
  /** Replaces the pending value and (re)arms the debounce timer. */
  schedule(value: T): void;
  /** Writes the pending value immediately, if any, and clears the timer. */
  flush(): void;
}

export function createSaveQueue<T>(save: (value: T) => void, delayMs: number): SaveQueue<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    schedule(value: T) {
      pending = value;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        const toSave = pending;
        pending = null;
        if (toSave !== null) save(toSave);
      }, delayMs);
    },
    flush() {
      clearTimer();
      const toSave = pending;
      pending = null;
      if (toSave !== null) save(toSave);
    },
  };
}
