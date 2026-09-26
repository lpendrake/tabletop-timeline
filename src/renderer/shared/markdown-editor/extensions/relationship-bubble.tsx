import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { sanitiseValue, type Role, type ResolvedTrack } from '../../../../shared/relationships';
import { SearchablePicker, type PickerOption } from '../../searchable-picker';
import {
  buildNotePickerRecents,
  decideBubbleKey,
  filterHeldOptions,
  initialNumberFieldValue,
  isAllowedNumberInputText,
  pickForTab,
  prefillNoteValue,
  rankNoteOptions,
  shouldNotifyHolderChosen,
  shouldOfferCreateOption,
  stepAmount,
  stepNumericValue,
  validateAmount,
  validateNumericValue,
  type BubbleCommitDirection,
  type BubbleKeyAction,
} from './relationship-bubble-logic';
import './relationship-bubble.css';

export type { BubbleCommitDirection };

export interface RelationshipBubbleProps {
  /** The directive's `from` — identifies which directive this blank belongs to (used to key the field, see `RelationshipBubble` below). */
  anchor: number;
  role: Role;
  value: string;
  prompt: string;
  track: ResolvedTrack | null;
  trackId: string;
  defaultReason: string;
  noteOptions: readonly PickerOption[];
  recentNoteIds: readonly string[];
  defaultHolderId: string | null;
  currentNoteId: string | null;
  heldOptionKeys: string[] | null;
  /** True while an async `heldOptions` lookup for this exact blank is in flight — see `relationship-bubble-view-plugin.ts`. */
  heldOptionsLoading: boolean;
  /** May return a `Promise` (e.g. a confirm dialog) — awaited before advancing, see `NotePickerField.commitPick`. */
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  onCommit: (value: string, direction: BubbleCommitDirection) => void;
  onClose: () => void;
  style: React.CSSProperties;
  tailSide: 'above' | 'below';
  /** Max height (px) to give a picker's option list so the whole bubble fits on screen, or `null` for no cap beyond the picker's own default — see `planBubbleFit`. */
  listMaxHeight: number | null;
  /**
   * Held by `relationship-bubble-view-plugin.ts` and passed straight to
   * whichever field renders a `SearchablePicker`, so the plugin can measure
   * the list's (and its first row's) real height off this reference instead
   * of querying the DOM. Unused by fields that don't render a picker.
   */
  listRef: React.Ref<HTMLDivElement>;
  /**
   * False for the initial hidden measuring pass (see
   * `relationship-bubble-view-plugin.ts`'s `render`), true once
   * repositioned and shown. Fields use this — not a plain mount-time
   * `autoFocus` — to grab focus, since the same box (and often the same
   * field instance) is repainted hidden-then-visible on every open AND on
   * every role switch; a hidden element can't take real focus, so waiting
   * for `visible` to flip true is what makes the focus land reliably.
   */
  visible: boolean;
  /** Horizontal offset (px) of the tail from the bubble's own left edge — see `computeTailOffset`. */
  tailOffset: number;
  /**
   * Held by `relationship-bubble-view-plugin.ts` and attached to the root
   * `.relationship-bubble` element, so the plugin can measure the bubble's
   * own real width/height off this reference for placement. The mounting
   * host (`.relationship-bubble-host`) is *not* a usable stand-in for this:
   * it's `position: fixed` and its only child (this root) is `position:
   * fixed` too, so the child is out of the host's normal flow and the
   * host's own `offsetWidth`/`offsetHeight` collapse to 0 — see
   * `computePlacement`'s size measurement.
   */
  bubbleRef: React.Ref<HTMLDivElement>;
}

function inputBounds(el: HTMLInputElement): { atStart: boolean; atEnd: boolean } {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start !== end) return { atStart: false, atEnd: false };
  return { atStart: start === 0, atEnd: end === el.value.length };
}

/**
 * Focuses `ref`'s element once the bubble is `visible`, with a
 * `requestAnimationFrame` follow-up in case something else (CodeMirror
 * regaining focus after the dispatch that opened the bubble, a menu's own
 * `restoreFocus`) steals it back in between. No-op while hidden — a
 * `visibility: hidden` element can't take real browser focus, so this
 * waits for the visible pass instead of racing it.
 *
 * Also selects any existing text in the field, so moving to a blank that
 * already has a value (stepping back to re-edit it, or a numeric field's
 * own default-to-`1`) leaves it selected — typing replaces it outright
 * rather than appending.
 */
function useBubbleFocus<T extends HTMLInputElement>(
  ref: React.RefObject<T | null>,
  visible: boolean,
): void {
  useLayoutEffect(() => {
    if (!visible) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    el.focus();
    el.select();
    const raf = requestAnimationFrame(() => {
      if (document.activeElement !== el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, ref]);
}

/**
 * The bubble's own floating box: tail pointing at its blank, mounted by
 * `relationship-bubble-view-plugin.ts` outside `view.dom`. Renders only —
 * every decision (advance/back/hop, validation, stepping, the Create-row
 * check) is a pure function from `relationship-bubble-logic.ts`.
 */
export function RelationshipBubble(props: RelationshipBubbleProps) {
  const { style, tailSide, tailOffset, anchor, role, bubbleRef } = props;
  return (
    <div className="relationship-bubble" style={style} ref={bubbleRef}>
      <div className="relationship-bubble-prompt">{props.prompt}</div>
      {/*
       * Keyed by (anchor, role) so moving to a different blank always
       * mounts a fresh field instance instead of reusing one across roles
       * (e.g. NotePickerField backs both `holder` and `observer` — without
       * this key, React would keep the same component instance and its own
       * uncontrolled query text would carry over from one field to the
       * next).
       */}
      <Field key={`${anchor}:${role}`} {...props} />
      <div
        className={`relationship-bubble-tail relationship-bubble-tail-${tailSide}`}
        style={{ left: tailOffset }}
      />
    </div>
  );
}

function Field(props: RelationshipBubbleProps) {
  const { role, track } = props;
  if (role === 'amount') {
    return (
      <NumberField
        {...props}
        validate={(raw) =>
          track ? validateAmount(raw, track) : { ok: false, message: 'Unknown track' }
        }
        step={(raw, dir) =>
          track ? stepAmount(raw, track, dir) : String((Number(raw) || 0) + dir)
        }
      />
    );
  }
  if (role === 'value' && track?.kind === 'ordinal') return <RungField {...props} track={track} />;
  if (role === 'value' && track) {
    return (
      <NumberField
        {...props}
        validate={(raw) => validateNumericValue(raw, track)}
        step={(raw, dir) => stepNumericValue(raw, track, dir)}
      />
    );
  }
  if (role === 'holder' || role === 'observer') return <NotePickerField {...props} />;
  if (role === 'option' && track?.kind === 'categorical')
    return <OptionField {...props} track={track} />;
  if (role === 'reason') return <ReasonField {...props} />;
  return <div className="relationship-bubble-error">Unsupported field</div>;
}

interface NumberFieldProps extends RelationshipBubbleProps {
  validate: (raw: string) => { ok: true; value: string } | { ok: false; message: string };
  step: (raw: string, dir: 1 | -1) => string;
}

function NumberField({
  role,
  value,
  track,
  onCommit,
  onClose,
  validate,
  step,
  visible,
}: NumberFieldProps) {
  const [text, setText] = useState(() => initialNumberFieldValue(role, value, track));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);

  function commit(direction: BubbleCommitDirection) {
    const result = validate(text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onCommit(result.value, direction);
  }

  function applyStep(dir: 1 | -1) {
    const stepped = step(text || '0', dir);
    setText(stepped);
    setError(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = ref.current;
    const action: BubbleKeyAction = decideBubbleKey(e.key, {
      shiftKey: e.shiftKey,
      ...(el ? inputBounds(el) : { atStart: false, atEnd: false }),
    });
    switch (action.type) {
      case 'close':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      case 'advance':
        e.preventDefault();
        commit('advance');
        return;
      case 'back':
        e.preventDefault();
        commit('back');
        return;
      case 'hop-next':
        e.preventDefault();
        commit('hop-next');
        return;
      case 'hop-prev':
        e.preventDefault();
        commit('hop-prev');
        return;
      case 'step':
        e.preventDefault();
        applyStep(action.dir);
        return;
      default:
        return;
    }
  }

  return (
    <div className="relationship-bubble-field">
      <div className="relationship-bubble-number-row">
        <input
          ref={ref}
          className="relationship-bubble-input"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            if (!isAllowedNumberInputText(next, track)) return;
            setText(next);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="relationship-bubble-stepper">
          <button
            type="button"
            className="relationship-bubble-stepper-button"
            tabIndex={-1}
            aria-label="Increase"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyStep(1)}
          >
            ▲
          </button>
          <button
            type="button"
            className="relationship-bubble-stepper-button"
            tabIndex={-1}
            aria-label="Decrease"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyStep(-1)}
          >
            ▼
          </button>
        </div>
      </div>
      {error && <div className="relationship-bubble-message">{error}</div>}
    </div>
  );
}

function ReasonField({
  value,
  defaultReason,
  onCommit,
  onClose,
  visible,
}: RelationshipBubbleProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);

  function commit(direction: BubbleCommitDirection) {
    onCommit(sanitiseValue(text), direction);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = ref.current;
    const action = decideBubbleKey(e.key, {
      shiftKey: e.shiftKey,
      ...(el ? inputBounds(el) : { atStart: false, atEnd: false }),
    });
    if (action.type === 'close') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (action.type === 'advance' || action.type === 'hop-next') {
      e.preventDefault();
      commit(action.type === 'advance' ? 'advance' : 'hop-next');
    } else if (action.type === 'back' || action.type === 'hop-prev') {
      e.preventDefault();
      commit(action.type === 'back' ? 'back' : 'hop-prev');
    }
  }

  return (
    <div className="relationship-bubble-field">
      <input
        ref={ref}
        className="relationship-bubble-input"
        type="text"
        placeholder={defaultReason}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

/**
 * Shared Tab/Shift-Tab handling for picker-backed fields (SearchablePicker
 * owns Enter/Up/Down/Escape). Which option Tab commits is decided by the
 * pure `pickForTab` — this only wires the DOM event to it.
 */
function usePickerTabHandler(
  options: readonly PickerOption[],
  recentIds: readonly string[] | undefined,
  value: string | null | undefined,
  onCommit: (value: string, direction: BubbleCommitDirection) => void,
  ranker?: (
    options: readonly PickerOption[],
    query: string,
    recentIds?: readonly string[],
  ) => PickerOption[],
) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLInputElement;
    const picked = pickForTab(options, target.value ?? '', recentIds, value, ranker);
    if (picked) onCommit(picked.id, e.shiftKey ? 'back' : 'advance');
  };
}

// Re-export rankNoteOptions for backwards compatibility
export { rankNoteOptions } from './relationship-bubble-logic';

function NotePickerField(props: RelationshipBubbleProps) {
  const {
    value,
    noteOptions,
    recentNoteIds,
    defaultHolderId,
    currentNoteId,
    role,
    listMaxHeight,
    listRef,
    onCommit,
    onClose,
    visible,
  } = props;
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);

  const recents = buildNotePickerRecents(recentNoteIds, currentNoteId);
  const prefilled = prefillNoteValue(role, value, defaultHolderId);

  /**
   * When choosing this holder is the first one (no default set yet), the
   * host may show a confirm dialog (`onHolderChosenWithoutDefault`) before
   * the value is committed — awaited here so the bubble only advances (and
   * moves focus to the next blank) once that dialog is gone, rather than
   * having the dialog steal focus back from a field that already advanced.
   */
  async function commitPick(id: string, direction: BubbleCommitDirection): Promise<void> {
    if (shouldNotifyHolderChosen(role, defaultHolderId)) {
      await props.onHolderChosenWithoutDefault?.(id);
    }
    onCommit(id, direction);
  }

  const handleTab = usePickerTabHandler(
    noteOptions,
    recents,
    prefilled,
    (id, direction) => void commitPick(id, direction),
    rankNoteOptions,
  );

  return (
    <div className="relationship-bubble-field" onKeyDownCapture={handleTab}>
      <SearchablePicker
        options={noteOptions}
        recentIds={recents}
        value={prefilled ?? null}
        inputRef={ref}
        placeholder={role === 'holder' ? 'Holder…' : 'Observer…'}
        ariaLabel={role}
        listMaxHeight={listMaxHeight ?? undefined}
        listRef={listRef}
        rank={rankNoteOptions}
        onCancel={onClose}
        onPick={(option) => void commitPick(option.id, 'advance')}
      />
    </div>
  );
}

function RungField(
  props: RelationshipBubbleProps & { track: Extract<ResolvedTrack, { kind: 'ordinal' }> },
) {
  const { value, track, listMaxHeight, listRef, onCommit, onClose, visible } = props;
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);
  const options: PickerOption[] = track.rungs.map((r) => ({
    id: r.key,
    path: r.label,
    label: r.label,
  }));

  const handleTab = usePickerTabHandler(options, undefined, value || null, onCommit);

  return (
    <div className="relationship-bubble-field" onKeyDownCapture={handleTab}>
      <SearchablePicker
        options={options}
        value={value || null}
        inputRef={ref}
        placeholder="Choose a level…"
        ariaLabel="value"
        listMaxHeight={listMaxHeight ?? undefined}
        listRef={listRef}
        onCancel={onClose}
        onPick={(option) => onCommit(option.id, 'advance')}
      />
    </div>
  );
}

/**
 * An unmatched query offers a "Create …" row via `SearchablePicker`'s
 * `createRow` slot — see that component's AGENTS.md for why this must not
 * go back to a separate, unmemoized listbox reimplementation.
 */
function OptionField(
  props: RelationshipBubbleProps & { track: Extract<ResolvedTrack, { kind: 'categorical' }> },
) {
  const {
    value,
    track,
    trackId,
    heldOptionKeys,
    heldOptionsLoading,
    listMaxHeight,
    listRef,
    createOption,
    onCommit,
    onClose,
    visible,
  } = props;
  const [query, setQuery] = useState('');
  const [mutual, setMutual] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);

  const allOptions: PickerOption[] = track.options.map((o) => ({
    id: o.key,
    path: o.label,
    label: o.label,
  }));
  const options = filterHeldOptions(allOptions, heldOptionKeys);
  const offerCreate = Boolean(createOption) && shouldOfferCreateOption(query, options);

  const handleTab = usePickerTabHandler(options, undefined, value || null, onCommit);

  async function doCreate() {
    if (!createOption || creating) return;
    setCreating(true);
    try {
      const result = await createOption(trackId, query.trim(), mutual);
      if (result) onCommit(result.key, 'advance');
    } finally {
      setCreating(false);
    }
  }

  if (heldOptionsLoading) {
    return (
      <div className="relationship-bubble-field">
        <div className="relationship-bubble-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="relationship-bubble-field" onKeyDownCapture={handleTab}>
      <SearchablePicker
        options={options}
        value={value || null}
        inputRef={ref}
        placeholder="Choose an option…"
        ariaLabel="option"
        emptyText="No matching option"
        listMaxHeight={listMaxHeight ?? undefined}
        listRef={listRef}
        onQueryChange={setQuery}
        onCancel={onClose}
        onPick={(option) => onCommit(option.id, 'advance')}
        createRow={
          createOption
            ? {
                show: offerCreate,
                render: () => (
                  <>
                    <span>Create &quot;{query.trim()}&quot;</span>
                    <label
                      className="relationship-bubble-mutual-label"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={mutual}
                        onChange={(e) => setMutual(e.target.checked)}
                      />
                      Symmetrical
                    </label>
                  </>
                ),
                onPick: () => void doCreate(),
              }
            : undefined
        }
      />
    </div>
  );
}
