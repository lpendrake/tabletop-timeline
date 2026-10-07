import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resetColumn,
  resizeColumn,
  type ColumnWidths,
  type NumericColumn,
} from '../domain/column-widths';
import { createSaveQueue, type SaveQueue } from '../view-order-save-queue';
import { loadColumnWidths, saveColumnWidths } from '../view-state-persistence';

export interface ColumnWidthsState {
  widths: ColumnWidths;
  setColumnWidth(column: NumericColumn, width: number): void;
  resetColumnWidth(column: NumericColumn): void;
}

interface CampaignWidths {
  campaignPath: string;
  widths: ColumnWidths;
}

const SAVE_DEBOUNCE_MS = 300;

function createColumnWidthsQueue(campaignPath: string): SaveQueue<ColumnWidths> {
  return createSaveQueue<ColumnWidths>(
    (widths) => saveColumnWidths(campaignPath, widths),
    SAVE_DEBOUNCE_MS,
  );
}

/**
 * Numeric-tab column widths, remembered per campaign. A change updates state immediately, so
 * callers may call `setColumnWidth` on every pointer move of a drag for live feedback; the
 * write to localStorage is debounced and flushed on campaign change and unmount. The setters
 * are stable per campaign and always apply to the latest widths, so several calls in one
 * batch or from a captured setter compose.
 */
export function useColumnWidths(campaignPath: string): ColumnWidthsState {
  const [stored, setStored] = useState<CampaignWidths>(() => ({
    campaignPath,
    widths: loadColumnWidths(campaignPath),
  }));
  const latestRef = useRef<CampaignWidths>(stored);
  const queueRef = useRef<SaveQueue<ColumnWidths> | null>(null);

  let current = stored;
  if (stored.campaignPath !== campaignPath) {
    current = { campaignPath, widths: loadColumnWidths(campaignPath) };
    setStored(current);
  }

  useEffect(() => {
    const queue = createColumnWidthsQueue(campaignPath);
    queueRef.current = queue;
    latestRef.current = { campaignPath, widths: loadColumnWidths(campaignPath) };
    return () => queue.flush();
  }, [campaignPath]);

  const update = useCallback(
    (change: (widths: ColumnWidths) => ColumnWidths) => {
      const latest = latestRef.current;
      if (latest.campaignPath !== campaignPath) return;
      const next = change(latest.widths);
      if (next === latest.widths) return;
      latestRef.current = { campaignPath, widths: next };
      setStored((prev) =>
        prev.campaignPath === campaignPath ? { campaignPath, widths: next } : prev,
      );
      queueRef.current?.schedule(next);
    },
    [campaignPath],
  );

  const setColumnWidth = useCallback(
    (column: NumericColumn, width: number) =>
      update((widths) => resizeColumn(widths, column, width)),
    [update],
  );
  const resetColumnWidth = useCallback(
    (column: NumericColumn) => update((widths) => resetColumn(widths, column)),
    [update],
  );

  return { widths: current.widths, setColumnWidth, resetColumnWidth };
}
