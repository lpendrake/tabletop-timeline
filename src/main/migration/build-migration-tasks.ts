import type { NamedTask } from '../campaign-loader.js';
import type { Migration } from './migration.js';
import { MIGRATIONS } from './registry.js';
import { getCampaignVersion, setCampaignVersion } from './campaign-version.js';

/**
 * Returns the ordered NamedTasks for every migration whose targetVersion exceeds
 * the campaign's current recorded version, lowest-to-highest. Each task runs the
 * migration then bumps & persists the campaign version to that migration's
 * targetVersion — but ONLY after the migration resolves successfully. If a
 * migration throws, the version is not bumped (it propagates through CampaignLoader,
 * which sends campaign:loadError and rethrows), so re-opening resumes from the last
 * successfully-applied version. Returns [] when the campaign is already up to date
 * (no migrations run, settings.json untouched).
 */
export function buildMigrationTasks(
  campaignPath: string,
  migrations: Migration[] = MIGRATIONS,
): NamedTask[] {
  const currentVersion = getCampaignVersion(campaignPath);
  const pending = migrations
    .filter((m) => m.targetVersion > currentVersion)
    .sort((a, b) => a.targetVersion - b.targetVersion);

  return pending.map((migration) => ({
    name: migration.name,
    task: async (onProgress) => {
      await migration.run(campaignPath, onProgress);
      setCampaignVersion(campaignPath, migration.targetVersion);
    },
  }));
}
