/** Per-campaign selected tab and per-track selected holder for the Relationships view (localStorage). */

interface Stored {
  tab?: string;
  holders?: Record<string, string>;
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
