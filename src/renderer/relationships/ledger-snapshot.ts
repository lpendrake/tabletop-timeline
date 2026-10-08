import type { Ledger } from '../../shared/relationships';
import { relationshipsData } from './data';

export interface LedgerSnapshot {
  /** The saved ledgers. Fetched on first call, then reused until the relationship index changes. */
  all(): Promise<Ledger[]>;
  /** Starts dropping the cache on relationship changes. Returns the function that stops it. */
  listen(): () => void;
}

/**
 * Caches the saved ledgers for one editor, so each keystroke in a directive
 * blank does not re-fetch them over IPC. Saved ledgers only change when main
 * emits a relationships-changed event, which drops the cache — but only while
 * the snapshot is listening (see `listen`). A failed fetch also drops it, so
 * the next call retries; the failure still reaches the caller that made the
 * request.
 */
export function createLedgerSnapshot(): LedgerSnapshot {
  let memo: Promise<Ledger[]> | null = null;

  return {
    all() {
      if (!memo) {
        const pending = relationshipsData.getAllLedgers();
        memo = pending;
        // Attached before the caller's own handlers, so the cache is clear
        // by the time the caller sees the rejection and calls again.
        pending.catch(() => {
          if (memo === pending) memo = null;
        });
      }
      return memo;
    },
    listen() {
      return relationshipsData.onChanged(() => {
        memo = null;
      });
    },
  };
}
