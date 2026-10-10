import { parseGroupBy, type CategoricalGroupBy } from './domain/categorical';
import { parseColumnWidths, type ColumnWidths } from './domain/numeric-columns';

/** Per-campaign selected tab, per-track selected holder and group-by, and numeric column widths for the Relationships view (localStorage). */
interface Stored {
  tab?: string;
  holders?: Record<string, string>;
  groupBy?: Record<string, string>;
  columnWidths?: unknown;
}

function storageKey(campaignPath: string): string {
  return `relationships-view:${campaignPath}`;
}

function read(campaignPath: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(campaignPath));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Stored;
  } catch {
    // corrupt or unavailable storage is treated as empty
  }
  return {};
}

function write(campaignPath: string, value: Stored): void {
  try {
    localStorage.setItem(storageKey(campaignPath), JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function loadSelectedTab(campaignPath: string): string | null {
  const tab = read(campaignPath).tab;
  return typeof tab === 'string' ? tab : null;
}

export function saveSelectedTab(campaignPath: string, trackId: string): void {
  write(campaignPath, { ...read(campaignPath), tab: trackId });
}

export function loadSelectedHolder(campaignPath: string, trackId: string): string | null {
  const holders = read(campaignPath).holders;
  const v = holders && typeof holders === 'object' ? holders[trackId] : undefined;
  return typeof v === 'string' ? v : null;
}

export function saveSelectedHolder(campaignPath: string, trackId: string, holderId: string): void {
  const cur = read(campaignPath);
  const holders = cur.holders && typeof cur.holders === 'object' ? cur.holders : {};
  write(campaignPath, { ...cur, holders: { ...holders, [trackId]: holderId } });
}

export function loadColumnWidths(campaignPath: string): ColumnWidths {
  return parseColumnWidths(read(campaignPath).columnWidths);
}

export function saveColumnWidths(campaignPath: string, widths: ColumnWidths): void {
  write(campaignPath, { ...read(campaignPath), columnWidths: widths });
}

export function loadGroupBy(campaignPath: string, trackId: string): CategoricalGroupBy {
  const groupBy = read(campaignPath).groupBy;
  const v = groupBy && typeof groupBy === 'object' ? groupBy[trackId] : undefined;
  return parseGroupBy(v);
}

export function saveGroupBy(
  campaignPath: string,
  trackId: string,
  groupBy: CategoricalGroupBy,
): void {
  const cur = read(campaignPath);
  const saved = cur.groupBy && typeof cur.groupBy === 'object' ? cur.groupBy : {};
  write(campaignPath, { ...cur, groupBy: { ...saved, [trackId]: groupBy } });
}
