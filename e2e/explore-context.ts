import type { AppHandle, Measurement } from './launch.js';

/**
 * What an explore script receives: the launched app (everything on AppHandle except `close`,
 * which the runner owns) plus a labelled `measure`.
 */
export type ExploreContext = Omit<AppHandle, 'close' | 'measure'> & {
  /**
   * Measures every match of `selector` and records the result under `label` in
   * measurements.json. Each label may be used once per run.
   */
  measure(label: string, selector: string): Promise<Measurement[]>;
};

export type ExploreScript = (ctx: ExploreContext) => Promise<void>;
