import type { Migration } from './migration.js';

export const sampleMigration: Migration = {
  name: 'Sample migration',
  targetVersion: 1,
  run: (_campaignPath, onProgress) => {
    // No-op: this sample exists only to exercise and document the framework.
    onProgress(1, 1);
  },
};
