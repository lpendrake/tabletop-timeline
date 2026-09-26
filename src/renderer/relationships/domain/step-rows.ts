/**
 * Builds the expanded history rows for a track row. Only called for expanded
 * rows — the directive sentence itself is rendered elsewhere; this just
 * carries `declaredIn` so a component can look up and render that text.
 */

import type { Step } from '../../../shared/relationships/current-value';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';

export interface StepRow {
  key: string;
  declaredIn: { path: string; ordinal: number };
  at: number | null;
  applied: boolean;
  reset: boolean;
  mirrored: boolean;
  formattedRunning: string;
  reason?: string;
}

export function buildStepRows(steps: Step[], track: ResolvedTrack): StepRow[] {
  return steps.map((step) => {
    const { delta } = step;
    const mirrored = delta.mirrored === true;
    return {
      key: `${delta.declaredIn.path}#${delta.declaredIn.ordinal}${mirrored ? '~m' : ''}`,
      declaredIn: delta.declaredIn,
      at: delta.at,
      applied: step.applied,
      reset: step.reset,
      mirrored,
      formattedRunning: track.format(step.runningValue),
      reason: delta.reason,
    };
  });
}
