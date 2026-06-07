import type { Migration } from './migration.js';
import { sampleMigration } from './migrations/0001-sample-migration.js';

/** All migrations, ascending by targetVersion. Append new migrations here. */
export const MIGRATIONS: Migration[] = [sampleMigration].sort(
  (a, b) => a.targetVersion - b.targetVersion,
);

/** Highest target version across all migrations; 0 if there are none. */
export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.targetVersion), 0);
