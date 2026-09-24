function storageKey(campaignPath: string): string {
  return `last-gasp:last-note-folder:${campaignPath}`;
}

/** Reads the last-used note folder for a campaign. Never throws. */
export function loadLastNoteFolder(campaignPath: string): string | null {
  try {
    const value = localStorage.getItem(storageKey(campaignPath));
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Persists the last-used note folder for a campaign. Never throws. */
export function saveLastNoteFolder(campaignPath: string, folder: string): void {
  try {
    localStorage.setItem(storageKey(campaignPath), folder);
  } catch {
    // ignore — this is a convenience, not required for correctness
  }
}
