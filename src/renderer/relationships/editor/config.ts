/**
 * Every per-editor setting the relationship directive extensions read, held
 * in one facet. Hosts never dispatch settings into the editor: a new value
 * arrives by reconfiguring the extensions (see `extensions.ts`), and each
 * piece that derives from it recomputes when the facet's value changes.
 */
import { Facet, type EditorState } from '@codemirror/state';
import {
  EMPTY_TRACK_LIBRARY,
  NOTE_DEFAULT_REASON,
  type TrackLibrary,
} from '../../../shared/relationships';
import type { ExternalSetConflictEntry } from '../domain/external-set-conflicts';
import type { DirectivePlace } from '../domain/place-for-path';
import type { PickerOption } from '../../shared/searchable-picker';

export type { DirectivePlace };

/** Which holder a Remove blank's tags should be fetched for, plus the directive's position and the buffer's text so the host can exclude this directive's own delta. */
export interface HeldTagsQuery {
  trackId: string;
  holder: string;
  anchor: number;
  doc: string;
}

/** Which track's usage a holder/observer blank should be sectioned by, plus the directive's position and the buffer's text so the host can exclude this directive's own delta. */
export interface TrackUsageQuery {
  trackId: string;
  anchor: number;
  doc: string;
}

/** Host data and callbacks the blanks' choices need. */
export interface RelationshipCompletionOptions {
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  /** Sets the default reputation holder (e.g. from the holder blank's "…and make it the default holder" row). */
  setDefaultHolder?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  /** The holder's held tags, by observer, at the declaring event's date. A rejection shows every tag/note, unfiltered. */
  heldTags?: (q: HeldTagsQuery) => Promise<Map<string, string[]>>;
  /**
   * The notes the track already uses: note id to the absolute distance in
   * seconds to that note's nearest entry on the track, or `null` for a used
   * note with no dated proximity. Ids absent from the map are not used. A
   * missing callback or a rejection lists every note as not used.
   */
  trackUsage?: (q: TrackUsageQuery) => Promise<Map<string, number | null>>;
}

export interface DirectiveSettings {
  library: TrackLibrary;
  /** Shown in an empty reason blank, and used as the reason when it stays empty. */
  defaultReason: string;
  place: DirectivePlace;
  /**
   * Hides the delete cross and disables caret and blank interaction; Ctrl/Cmd+click
   * still opens notes. The preview builder also omits editing and choices
   * (`directiveEditing`, `directiveCompletions`), so a read-only view has no guard or keymap.
   */
  readOnly: boolean;
  onOpenNote?: (id: string) => void;
  /**
   * Every undated Set declared in another saved note (this buffer's own path
   * excluded — the buffer is the truth for it), to flag a cross-file
   * conflict. Empty for an event, which never conflicts.
   */
  externalSetConflicts: readonly ExternalSetConflictEntry[];
  /** What a blank's list needs (notes, held tags, creating a tag). */
  choices: RelationshipCompletionOptions;
}

export const NO_CHOICES: RelationshipCompletionOptions = { noteOptions: () => [] };

/** Read-only and note-restricted: what an editor reads when no builder supplied settings. */
const DEFAULT_SETTINGS: DirectiveSettings = {
  library: EMPTY_TRACK_LIBRARY,
  defaultReason: NOTE_DEFAULT_REASON,
  place: 'note',
  readOnly: true,
  externalSetConflicts: [],
  choices: NO_CHOICES,
};

export const directiveSettings = Facet.define<DirectiveSettings, DirectiveSettings>({
  combine: (values) => values[0] ?? DEFAULT_SETTINGS,
});

/** True when the directive settings differ between two states (a reconfigure supplied new ones). */
export function settingsChanged(before: EditorState, after: EditorState): boolean {
  return before.facet(directiveSettings) !== after.facet(directiveSettings);
}
