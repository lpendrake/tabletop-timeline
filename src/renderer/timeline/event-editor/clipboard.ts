/**
 * Write text to the system clipboard. Isolated here (not inline in a
 * component) so the IO is mockable and components stay logic-free.
 */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
