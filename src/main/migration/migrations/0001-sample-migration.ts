import type { Migration } from '../migration.js';
import { appendMigrationLog } from '../migration-log.js';

/**
 * Template migration — no-op that demonstrates both reporting mechanisms:
 * 1. Returns a summary string shown in the post-load notification.
 * 2. Writes one illustrative action entry via appendMigrationLog so a
 *    per-migration log file is created under <campaign>/migration-log/.
 *
 * Copy this file as the starting point for new migrations; replace the noop
 * body with real file I/O and adjust the summary string accordingly.
 */
export const sampleMigration: Migration = {
  name: 'Sample migration',
  targetVersion: 1,
  run: (campaignPath, onProgress) => {
    onProgress(1, 1);
    appendMigrationLog(campaignPath, '0001-sample-migration', {
      noop: { detail: 'sample migration ran; no changes made' },
    });
    return 'no changes';
  },
};
