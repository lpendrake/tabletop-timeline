/** Copy text to the system clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Read plain text from the system clipboard. */
export async function readFromClipboard(): Promise<string> {
  return navigator.clipboard.readText();
}
