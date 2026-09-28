import { defaultViewOrder, parseViewOrder, serialiseViewOrder, type ViewOrder } from './domain';

/**
 * Renderer-side IO port for the Relationships view's user-ordering /
 * collapse-state file. Thin wrapper over `window.fsApi` — React code must go
 * through this, never `window.fsApi` directly (mirrors `notes/data.ts`).
 */

const RELATIONSHIPS_DIR = 'relationships';
const FILE_NAME = 'view-order.json';

function dirPath(campaignPath: string): string {
  return `${campaignPath}/${RELATIONSHIPS_DIR}`;
}

function filePath(campaignPath: string): string {
  return `${dirPath(campaignPath)}/${FILE_NAME}`;
}

export const viewOrderData = {
  /** Never throws — a missing, unreadable or garbage file falls back to defaults. */
  async load(campaignPath: string): Promise<ViewOrder> {
    try {
      const raw = await window.fsApi.read(filePath(campaignPath));
      if (!raw) return defaultViewOrder();
      return parseViewOrder(JSON.parse(raw));
    } catch {
      return defaultViewOrder();
    }
  },

  async save(campaignPath: string, order: ViewOrder): Promise<void> {
    await window.fsApi.mkdir(dirPath(campaignPath));
    await window.fsApi.write(filePath(campaignPath), serialiseViewOrder(order));
  },
};
