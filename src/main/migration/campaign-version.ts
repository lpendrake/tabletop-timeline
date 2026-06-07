import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from '../settings/settings-json.js';

/**
 * Returns the `version` stored in `<campaignPath>/settings.json`.
 *
 * Returns `0` when:
 * - The file does not exist
 * - The file is malformed JSON
 * - The `version` key is absent
 * - The value is not a non-negative integer (e.g. a float, string, negative number)
 *
 * This means any campaign that has never been through the migration framework is
 * treated as version 0 and will have all migrations applied on its next open.
 */
export function getCampaignVersion(campaignPath: string): number {
  const file = path.join(campaignPath, 'settings.json');
  const obj = readJsonObject(file);
  const value = obj.version;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return 0;
}

/**
 * Writes `version` into `<campaignPath>/settings.json`, merging with any
 * existing keys (e.g. `theme` is preserved).
 */
export function setCampaignVersion(campaignPath: string, version: number): void {
  const file = path.join(campaignPath, 'settings.json');
  const obj = readJsonObject(file);
  obj.version = version;
  writeJsonObject(file, obj);
}
