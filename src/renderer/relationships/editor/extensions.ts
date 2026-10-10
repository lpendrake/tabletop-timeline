/**
 * What a host passes to `MarkdownEditor`/`MarkdownPreview` as
 * `liveExtensions` to show relationship directives. Each builder pairs one
 * `directiveSettings` value with the module-level extension pieces, so a new
 * settings value reconfigures the editor without resetting any field,
 * plugin or in-flight pick.
 */
import type { Extension } from '@codemirror/state';
import { NOTE_DEFAULT_REASON, type TrackLibrary } from '../../../shared/relationships';
import {
  NO_CHOICES,
  directiveSettings,
  type DirectivePlace,
  type RelationshipCompletionOptions,
} from './config';
import type { ExternalSetConflictEntry } from '../domain/external-set-conflicts';
import { directiveEditing, directiveRendering } from './directives';
import { directiveCompletions } from './directive-completions';

export interface RelationshipEditorSettings {
  library: TrackLibrary;
  defaultReason: string;
  place: DirectivePlace;
  onOpenNote?: (id: string) => void;
  /** Note editors only: every undated Set declared in another saved note. */
  externalSetConflicts?: readonly ExternalSetConflictEntry[];
  choices: RelationshipCompletionOptions;
}

/** An editable editor: live blanks, the guard and keymap, and the blanks' choices. */
export function relationshipEditorExtensions(settings: RelationshipEditorSettings): Extension {
  return [
    directiveSettings.of({
      ...settings,
      readOnly: false,
      externalSetConflicts: settings.externalSetConflicts ?? [],
    }),
    directiveRendering,
    directiveEditing,
    directiveCompletions,
  ];
}

export interface RelationshipPreviewSettings {
  library: TrackLibrary;
  /** The shown file's title: an empty reason reads as this, or the note default without one. */
  title: string;
  place: DirectivePlace;
  onOpenNote?: (id: string) => void;
}

/** A read-only preview: rendering and Ctrl/Cmd+click on a note only. */
export function relationshipPreviewExtensions({
  library,
  title,
  place,
  onOpenNote,
}: RelationshipPreviewSettings): Extension {
  return [
    directiveSettings.of({
      library,
      defaultReason: title || NOTE_DEFAULT_REASON,
      place,
      readOnly: true,
      onOpenNote,
      externalSetConflicts: [],
      choices: NO_CHOICES,
    }),
    directiveRendering,
  ];
}
