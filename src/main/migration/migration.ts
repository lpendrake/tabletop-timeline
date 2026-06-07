/**
 * Contract for a single campaign migration.
 *
 * ## Idempotency
 * Every `run` implementation MUST be idempotent: running it twice on the same
 * campaign must leave the campaign in exactly the same state as running it once.
 * The framework records the applied version after each successful run, so in
 * practice a migration only runs once — but idempotency is required as a safety
 * net (e.g. if a crash occurs between the migration succeeding and the version
 * being persisted).
 *
 * ## Error handling
 * If `run` encounters data it cannot convert it MUST throw, not silently skip.
 * Throwing causes `CampaignLoader` to emit `campaign:loadError` and leaves the
 * campaign version at the last successfully-applied migration, so the user can
 * fix the data and retry by re-opening the campaign.
 *
 * ## Summary string
 * `run` must return a short human-readable string describing what it did.
 * This string is shown to the user in the post-load notification, e.g.
 * `"renamed 3 files"` or `"no changes"` for a no-op migration.
 */
export interface Migration {
  /** User-visible task name shown in the load overlay; title-case prose, e.g. "Sample migration". */
  name: string;
  /** The campaign version this migration brings a campaign up to. Must be a positive integer, unique across migrations. */
  targetVersion: number;
  /**
   * Idempotent task operating on the campaign path.
   * Returns a short human-readable summary string shown in the post-load notification
   * (e.g. `"renamed 3 files"`, or `"no changes"` for a no-op).
   */
  run: (
    campaignPath: string,
    onProgress: (completed: number, total: number) => void,
  ) => Promise<string> | string;
}
