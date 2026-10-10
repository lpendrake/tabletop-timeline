import { useEffect, useRef } from 'react';
import {
  EditorView,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { Compartment, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import {
  indentOnInput,
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { lastGaspThemeExtensions } from './theme';
import {
  wikiLinks,
  setKnownIds,
  setEntityLabels,
  type WikiLinkSuggestion,
} from './extensions/wiki-links';
import { markdownLinkClick, type MarkdownLinkClickConfig } from './extensions/markdown-link-click';
import { markdownDecorations } from './extensions/decorations';
import { imagePaste, type ImagePasteConfig } from './extensions/image-paste';
import { imageDecorations, type ImageDecorationsOptions } from './extensions/image-decorations';
import { dropLink, type DropLinkConfig } from './extensions/drop-link';
import { editorContextMenu, type EditorMenuExtraItems } from './extensions/editor-context-menu';
import {
  relationshipDirectives,
  setDirectiveContext,
  setExternalSetConflicts,
  type ExternalSetConflictEntry,
} from '../../relationships/editor/directives';
import {
  relationshipDirectiveCompletions,
  type RelationshipCompletionOptions,
} from '../../relationships/editor/directive-completions';
import { formattingKeymap } from './commands';
import { EMPTY_TRACK_LIBRARY, NOTE_DEFAULT_REASON } from '../../../shared/relationships';
import type { TrackLibrary } from '../../../shared/relationships';

/**
 * Pairs an EditorState with the Compartment instance embedded in it.
 * Both must travel together — you cannot reconfigure a compartment that
 * belongs to a different state.
 */
export interface SavedEditorInstance {
  state: EditorState;
  modeCompartment: Compartment;
}

export interface WikiLinksHostConfig {
  suggest?: (query: string) => Promise<WikiLinkSuggestion[]>;
  onOpen?: (id: string) => void;
  knownIds?: Set<string>;
  /** Map of entity id → display label for resolving [[id]] links with no local label. */
  entityLabels?: Map<string, string>;
  onHover?: (id: string, el: HTMLElement) => void;
  onHoverEnd?: (relatedTarget: Element | null) => void;
  /** Hides local-label-editing context-menu items even when the editor itself is editable. */
  readOnly?: boolean;
}

export interface RelationshipDirectivesHostConfig {
  library: TrackLibrary;
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /**
   * Whether this document is a note (undated) or an event. Passed through
   * to `interpretDirective` as `undated: place === 'note'` — a note may only
   * Set/Add, never Change/Shift/Remove (see `src/shared/relationships/AGENTS.md`).
   * Required — every host must say which it is explicitly; there is no
   * default, since silently defaulting to the permissive `'event'` context
   * is exactly what let a note wrongly accept Change/Shift/Remove before.
   */
  place: 'note' | 'event';
  /** Data and callbacks the blanks' choices need (notes, held tags, creating a tag). Omit for blanks with no note list. */
  choices?: RelationshipCompletionOptions;
  /**
   * Every undated Set declared in another saved note — used to flag a
   * cross-file conflict (only one note may Set a relationship). The host
   * excludes this buffer's own path; omit for an event editor, where it's
   * meaningless. See `relationships/editor/directives.ts`.
   */
  externalSetConflicts?: ExternalSetConflictEntry[];
}

export interface MarkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;

  /** When true, disables all editing and makes onChange optional. */
  readOnly?: boolean;

  isSourceMode?: boolean;

  savedInstance?: SavedEditorInstance;
  onSaveInstance?: (instance: SavedEditorInstance) => void;

  /** Imperative handle for toolbars and focus management. */
  viewRef?: React.MutableRefObject<EditorView | null>;

  /** Enables wiki-link parsing, completion, and click-to-open. Omit to disable. */
  wikiLinks?: WikiLinksHostConfig;

  /** Image decoration options — supply resolveSrc to handle non-notes-asset URLs. */
  images?: ImageDecorationsOptions;

  /** Enables image paste-to-disk. Omit to drop pasted images silently. */
  imagePaste?: ImagePasteConfig;

  /** Enables drag-and-drop link insertion. Omit to disable. */
  dropLink?: DropLinkConfig;

  /** Enables Ctrl/Cmd+click on standard markdown links `[text](url)`. */
  mdLinks?: MarkdownLinkClickConfig;

  /** Host-supplied items appended to the editor's own context menu (right-click and `/`). */
  contextMenu?: { extraItems?: EditorMenuExtraItems };

  /**
   * Renders relationship directives (`{{trackId.action ...}}`) as readable
   * blocks in live mode. Omit to render blocks with built-in tracks only and
   * `Unspecified` as the default reason (no field-editing callbacks).
   */
  relationshipDirectives?: RelationshipDirectivesHostConfig;

  /**
   * Document offset at which to place the caret when the editor first mounts
   * with fresh content (i.e. no `savedInstance`). Clamped to [0, doc.length].
   * Omit (or pass `undefined`) to keep the default behaviour of caret at 0.
   */
  initialCursor?: number;

  /**
   * Host-supplied extensions active only in live (non-source) mode. A new
   * value reconfigures them in place without rebuilding the rest of the
   * editor, so hosts should memoize it.
   */
  liveExtensions?: Extension;
}

function makeCompletionOptions(
  config: RelationshipDirectivesHostConfig | undefined,
): RelationshipCompletionOptions {
  const choices = config?.choices;
  return {
    noteOptions: () => choices?.noteOptions() ?? [],
    defaultHolderId: () => choices?.defaultHolderId?.() ?? null,
    currentNoteId: () => choices?.currentNoteId?.() ?? null,
    setDefaultHolder: choices?.setDefaultHolder,
    createOption: choices?.createOption,
    heldTags: choices?.heldTags,
    trackUsage: choices?.trackUsage,
  };
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  content,
  onChange,
  readOnly = false,
  isSourceMode = false,
  savedInstance,
  onSaveInstance,
  viewRef,
  wikiLinks: wikiLinksConfig,
  images: imagesConfig,
  imagePaste: imagePasteConfig,
  dropLink: dropLinkConfig,
  mdLinks: mdLinksConfig,
  contextMenu: contextMenuConfig,
  relationshipDirectives: relationshipDirectivesConfig,
  initialCursor,
  liveExtensions,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalViewRef = useRef<EditorView | null>(null);

  // Stable refs so effects/callbacks always call the latest version.
  const onChangeRef = useRef(onChange);
  const onSaveInstanceRef = useRef(onSaveInstance);
  const isSourceModeRef = useRef(isSourceMode);
  const readOnlyRef = useRef(readOnly);
  const wikiLinksRef = useRef(wikiLinksConfig);
  const imagesRef = useRef(imagesConfig);
  const mdLinksRef = useRef(mdLinksConfig);
  const contextMenuRef = useRef(contextMenuConfig);
  const relationshipDirectivesRef = useRef(relationshipDirectivesConfig);
  const liveExtensionsRef = useRef(liveExtensions);
  // Nested in the mode compartment's live branch; one per component instance.
  const liveCompartmentRef = useRef(new Compartment());
  onChangeRef.current = onChange;
  onSaveInstanceRef.current = onSaveInstance;
  isSourceModeRef.current = isSourceMode;
  readOnlyRef.current = readOnly;
  wikiLinksRef.current = wikiLinksConfig;
  imagesRef.current = imagesConfig;
  mdLinksRef.current = mdLinksConfig;
  contextMenuRef.current = contextMenuConfig;
  relationshipDirectivesRef.current = relationshipDirectivesConfig;
  liveExtensionsRef.current = liveExtensions;

  const modeCompartmentRef = useRef<Compartment>(
    savedInstance?.modeCompartment ?? new Compartment(),
  );

  /** Extensions that differ between live and source mode. */
  function buildModeExtensions(sourceMode: boolean): Extension[] {
    if (sourceMode) return [];
    const exts: Extension[] = [
      markdownDecorations(),
      imageDecorations(imagesRef.current),
      wikiLinks({
        suggest: (q) => wikiLinksRef.current?.suggest(q) ?? Promise.resolve([]),
        onOpen: (id) => wikiLinksRef.current?.onOpen(id),
        onHover: (id, el) => wikiLinksRef.current?.onHover?.(id, el),
        onHoverEnd: (rt) => wikiLinksRef.current?.onHoverEnd?.(rt),
        readOnly: readOnlyRef.current || Boolean(wikiLinksRef.current?.readOnly),
      }),
      markdownLinkClick({
        onOpenExternal: (u) => mdLinksRef.current?.onOpenExternal?.(u),
        onOpenInternal: (u) => mdLinksRef.current?.onOpenInternal?.(u),
      }),
      relationshipDirectives({
        readOnly: readOnlyRef.current,
        onOpenNote: (id) => relationshipDirectivesRef.current?.onOpenNote?.(id),
        // `relationshipDirectives` prop is itself optional — when the host
        // supplies no config at all (built-in tracks, no field-editing),
        // there is no `place` to be explicit about, so this is the one
        // spot that still defaults to the permissive 'event' context. Any
        // host that DOES supply `RelationshipDirectivesHostConfig` must
        // give `place` explicitly — it's a required field there.
        place: relationshipDirectivesRef.current?.place ?? 'event',
      }),
      liveCompartmentRef.current.of(liveExtensionsRef.current ?? []),
    ];
    if (!readOnlyRef.current) {
      exts.push(
        relationshipDirectiveCompletions(() =>
          makeCompletionOptions(relationshipDirectivesRef.current),
        ),
      );
    }
    return exts;
  }

  // Mount / unmount — runs exactly once per component instance.
  // isSourceMode is intentionally NOT in the dep array; mode changes are
  // handled by the reconfigure effect below without recreating the editor.
  useEffect(() => {
    if (!editorRef.current) return;

    const compartment = modeCompartmentRef.current;

    const ro = readOnlyRef.current;

    const baseExtensions: Extension[] = [
      ...(ro ? [] : [highlightActiveLine()]),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      markdown({ codeLanguages: languages, base: markdownLanguage }),
      lastGaspThemeExtensions,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      Prec.high(formattingKeymap),
      compartment.of(buildModeExtensions(isSourceModeRef.current)),
      // Registered after the compartment so the wiki-link contextmenu handler
      // (inside buildModeExtensions, live mode only) gets first refusal on
      // right-clicks — it consumes the event when the click lands on a
      // `.cm-note-link`; this extension only fires when it doesn't.
      editorContextMenu({ readOnly: ro, getExtraItems: () => contextMenuRef.current?.extraItems }),
    ];

    if (ro) {
      baseExtensions.push(EditorState.readOnly.of(true));
      baseExtensions.push(EditorView.editable.of(false));
    }

    if (imagePasteConfig) {
      baseExtensions.push(imagePaste(imagePasteConfig));
    }
    if (dropLinkConfig) {
      baseExtensions.push(dropLink(dropLinkConfig));
    }

    // Restore a previously saved instance (preserves doc, selection, undo history).
    let initialState: EditorState;
    if (savedInstance) {
      initialState = savedInstance.state;
    } else {
      const docLen = content.length;
      const anchor = initialCursor !== undefined ? Math.min(Math.max(0, initialCursor), docLen) : 0;
      initialState = EditorState.create({
        doc: content,
        selection: EditorSelection.single(anchor),
        extensions: baseExtensions,
      });
    }

    const view = new EditorView({ state: initialState, parent: editorRef.current });
    internalViewRef.current = view;
    if (viewRef) viewRef.current = view;

    if (savedInstance) {
      // Sync mode in case it changed while this tab was backgrounded.
      view.dispatch({
        effects: compartment.reconfigure(buildModeExtensions(isSourceModeRef.current)),
      });
    }

    return () => {
      onSaveInstanceRef.current?.({ state: view.state, modeCompartment: compartment });
      if (viewRef) viewRef.current = null;
      view.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mode toggle — reconfigures the compartment in-place without editor recreation.
  useEffect(() => {
    const view = internalViewRef.current;
    if (!view) return;
    view.dispatch({
      effects: modeCompartmentRef.current.reconfigure(buildModeExtensions(isSourceMode)),
    });
    view.focus();
  }, [isSourceMode]);

  // Host live-mode extensions — swapped in place while the live branch is installed.
  // In source mode the new value is picked up from the ref on the next toggle to live.
  useEffect(() => {
    const view = internalViewRef.current;
    const live = liveCompartmentRef.current;
    if (!view || live.get(view.state) === undefined) return;
    view.dispatch({ effects: live.reconfigure(liveExtensions ?? []) });
  }, [liveExtensions]);

  // External content update (e.g. file reloaded from disk).
  useEffect(() => {
    const view = internalViewRef.current;
    if (view && content !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
  }, [content]);

  // Keep wiki-link completions aware of the current known IDs.
  useEffect(() => {
    const view = internalViewRef.current;
    if (view && wikiLinksConfig?.knownIds && !isSourceMode) {
      view.dispatch({ effects: setKnownIds.of(wikiLinksConfig.knownIds) });
    }
  }, [wikiLinksConfig?.knownIds, isSourceMode]);

  // Keep wiki-link decorations aware of the current entity label map.
  useEffect(() => {
    const view = internalViewRef.current;
    if (view && wikiLinksConfig?.entityLabels && !isSourceMode) {
      view.dispatch({ effects: setEntityLabels.of(wikiLinksConfig.entityLabels) });
    }
  }, [wikiLinksConfig?.entityLabels, isSourceMode]);

  // Keep relationship-directive blocks aware of the current track library and default reason.
  useEffect(() => {
    const view = internalViewRef.current;
    if (view && !isSourceMode) {
      view.dispatch({
        effects: setDirectiveContext.of({
          library: relationshipDirectivesConfig?.library ?? EMPTY_TRACK_LIBRARY,
          defaultReason: relationshipDirectivesConfig?.defaultReason ?? NOTE_DEFAULT_REASON,
        }),
      });
    }
  }, [
    relationshipDirectivesConfig?.library,
    relationshipDirectivesConfig?.defaultReason,
    isSourceMode,
  ]);

  // Keep relationship-directive blocks aware of every undated Set declared
  // in another saved note, so a cross-file conflict flags live.
  useEffect(() => {
    const view = internalViewRef.current;
    if (view && !isSourceMode) {
      view.dispatch({
        effects: setExternalSetConflicts.of(
          relationshipDirectivesConfig?.externalSetConflicts ?? [],
        ),
      });
    }
  }, [relationshipDirectivesConfig?.externalSetConflicts, isSourceMode]);

  return <div ref={editorRef} className="markdown-editor-container" />;
};
