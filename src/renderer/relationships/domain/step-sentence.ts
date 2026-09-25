/**
 * Builds the readable-sentence model for one expanded history step, by
 * finding the declaring file's parsed directive matching the step's
 * `declaredIn.ordinal` and running it through `readableParts`. Also carries
 * the "mirrored from" label for a step that was derived from a `mutual`
 * option declared on the paired ledger.
 */

import type {
  ParsedDirective,
  ReadablePart,
  ResolvedTrack,
  Ledger,
} from '../../../shared/relationships';
import { readableParts } from '../../../shared/relationships';
import type { StepRow } from './step-rows';

export interface ParsedFile {
  title?: string;
  directives: ParsedDirective[];
}

export interface StepSentence {
  parts: ReadablePart[];
  /** Label of the entity whose own declaration this step mirrors; null when not mirrored. */
  mirroredFromLabel: string | null;
}

/** Directives declared directly on a note live under `notes/`; events under `timeline/`. */
export function isEventPath(path: string): boolean {
  return path.startsWith('timeline/');
}

export function buildStepSentence(
  ledger: Ledger,
  step: StepRow,
  track: ResolvedTrack,
  parsedFile: ParsedFile | undefined,
  labelForNote: (id: string) => string,
): StepSentence | null {
  if (!parsedFile) return null;
  const directive = parsedFile.directives.find((d) => d.ordinal === step.declaredIn.ordinal);
  if (!directive) return null;

  const defaultReason = isEventPath(step.declaredIn.path)
    ? (parsedFile.title ?? 'Unspecified')
    : 'Unspecified';

  const parts = readableParts(directive, { track, labelForNote, defaultReason });

  // A mirrored delta lives on ledger (observer, holder) relative to the
  // directive's own (holder, observer): the party whose declaration it
  // mirrors is this ledger's observer.
  const mirroredFromLabel = step.mirrored ? labelForNote(ledger.observer) : null;

  return { parts, mirroredFromLabel };
}
