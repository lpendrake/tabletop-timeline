import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  noteIdOf,
  sanitiseValue,
  type Role,
  type ResolvedTrack,
} from '../../../../shared/relationships';
import {
  SearchablePicker,
  moveHighlight,
  rankPickerOptions,
  type PickerOption,
} from '../../searchable-picker';
import {
  decideBubbleKey,
  filterHeldOptions,
  shouldOfferCreateOption,
  stepAmount,
  stepNumericValue,
  validateAmount,
  validateNumericValue,
  type BubbleKeyAction,
} from './relationship-bubble-logic';
import './relationship-bubble.css';

export type BubbleCommitDirection = 'advance' | 'back' | 'hop-next' | 'hop-prev';

export interface RelationshipBubbleProps {
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
  onHolderChosenWithoutDefault?: (id: string) => void;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  onCommit: (value: string, direction: BubbleCommitDirection) => void;
  onClose: () => void;
  style: React.CSSProperties;
  tailSide: 'above' | 'below';
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
 */
function useBubbleFocus<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  visible: boolean,
): void {
  useLayoutEffect(() => {
    if (!visible) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    el.focus();
    const raf = requestAnimationFrame(() => {
      if (document.activeElement !== el) el.focus();
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
  const { style, tailSide, tailOffset } = props;
  return (
    <div className="relationship-bubble" style={style}>
      <div className="relationship-bubble-prompt">{props.prompt}</div>
      <Field {...props} />
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

function NumberField({ value, onCommit, onClose, validate, step, visible }: NumberFieldProps) {
  const [text, setText] = useState(value);
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

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const el = ref.current;
    const action: BubbleKeyAction = decideBubbleKey(e.key, {
      shiftKey: e.shiftKey,
      ...(el ? inputBounds(el) : { atStart: false, atEnd: false }),
    });
    switch (action.type) {
      case 'close':
        e.preventDefault();
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
      case 'step': {
        e.preventDefault();
        const stepped = step(text || '0', action.dir);
        setText(stepped);
        setError(null);
        return;
      }
      default:
        return;
    }
  }

  return (
    <div className="relationship-bubble-field">
      <input
        ref={ref}
        className="relationship-bubble-input"
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
      />
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

/** Shared Tab/Shift-Tab handling for picker-backed fields (SearchablePicker owns Enter/Up/Down/Escape). */
function usePickerTabHandler(
  options: readonly PickerOption[],
  recentIds: readonly string[] | undefined,
  value: string | null | undefined,
  onCommit: (value: string, direction: BubbleCommitDirection) => void,
) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLInputElement;
    const query = target.value ?? '';
    const ranked = rankPickerOptions(options, query, recentIds);
    let picked = ranked[0];
    if (!query.trim() && value) {
      const matched = ranked.find((o) => o.id === value);
      if (matched) picked = matched;
    }
    if (picked) onCommit(picked.id, e.shiftKey ? 'back' : 'advance');
  };
}

function NotePickerField(props: RelationshipBubbleProps) {
  const {
    value,
    noteOptions,
    recentNoteIds,
    defaultHolderId,
    currentNoteId,
    role,
    onCommit,
    onClose,
    visible,
  } = props;
  const ref = useRef<HTMLInputElement>(null);
  useBubbleFocus(ref, visible);

  const recents = [...recentNoteIds];
  if (currentNoteId && !recents.includes(currentNoteId)) recents.unshift(currentNoteId);

  const currentId = noteIdOf(value) ?? (value || undefined);
  const prefilled = role === 'holder' && !currentId ? (defaultHolderId ?? undefined) : currentId;

  const handleTab = usePickerTabHandler(noteOptions, recents, prefilled, (v, dir) => {
    if (role === 'holder' && !defaultHolderId) props.onHolderChosenWithoutDefault?.(v);
    onCommit(v, dir);
  });

  return (
    <div className="relationship-bubble-field" onKeyDownCapture={handleTab}>
      <SearchablePicker
        options={noteOptions}
        recentIds={recents}
        value={prefilled ?? null}
        inputRef={ref}
        placeholder={role === 'holder' ? 'Holder…' : 'Observer…'}
        ariaLabel={role}
        onCancel={onClose}
        onPick={(option) => {
          if (role === 'holder' && !defaultHolderId)
            props.onHolderChosenWithoutDefault?.(option.id);
          onCommit(option.id, 'advance');
        }}
      />
    </div>
  );
}

function RungField(
  props: RelationshipBubbleProps & { track: Extract<ResolvedTrack, { kind: 'ordinal' }> },
) {
  const { value, track, onCommit, onClose, visible } = props;
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
        onCancel={onClose}
        onPick={(option) => onCommit(option.id, 'advance')}
      />
    </div>
  );
}

/**
 * Options need a "Create …" row unknown queries don't get elsewhere, so this
 * field builds its own minimal list (via the same pure `picker-model.ts`
 * helpers `SearchablePicker` uses) instead of `SearchablePicker` itself,
 * which has no room for that row.
 */
function OptionField(
  props: RelationshipBubbleProps & { track: Extract<ResolvedTrack, { kind: 'categorical' }> },
) {
  const { value, track, trackId, heldOptionKeys, createOption, onCommit, onClose, visible } = props;
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
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
  const ranked = rankPickerOptions(options, query);
  const offerCreate = Boolean(createOption) && shouldOfferCreateOption(query, options);
  const rowCount = ranked.length + (offerCreate ? 1 : 0);

  useEffect(() => {
    if (!query.trim() && value) {
      const index = ranked.findIndex((o) => o.id === value);
      if (index >= 0) setHighlight(index);
    }
    // Only on the initial (empty-query) result set — mirrors SearchablePicker's own behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked]);

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

  function pickHighlighted(direction: BubbleCommitDirection) {
    if (offerCreate && highlight === ranked.length) {
      void doCreate();
      return;
    }
    const picked = ranked[highlight];
    if (picked) onCommit(picked.id, direction);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, rowCount, 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, rowCount, -1));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    const el = ref.current;
    const action = decideBubbleKey(e.key, {
      shiftKey: e.shiftKey,
      ...(el ? inputBounds(el) : { atStart: false, atEnd: false }),
    });
    if (action.type === 'advance' || action.type === 'back') {
      e.preventDefault();
      pickHighlighted(action.type);
    } else if (action.type === 'hop-next' || action.type === 'hop-prev') {
      e.preventDefault();
      pickHighlighted(action.type);
    }
  }

  return (
    <div className="relationship-bubble-field">
      <input
        ref={ref}
        className="relationship-bubble-input"
        type="text"
        placeholder="Choose an option…"
        aria-label="option"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="relationship-bubble-list" role="listbox">
        {ranked.map((option, index) => (
          <div
            key={option.id}
            role="option"
            aria-selected={index === highlight}
            className={`relationship-bubble-row${index === highlight ? ' is-highlighted' : ''}`}
            onMouseEnter={() => setHighlight(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              onCommit(option.id, 'advance');
            }}
          >
            {option.label ?? option.path}
          </div>
        ))}
        {offerCreate && (
          <div
            role="option"
            aria-selected={highlight === ranked.length}
            className={`relationship-bubble-row relationship-bubble-create-row${
              highlight === ranked.length ? ' is-highlighted' : ''
            }`}
            onMouseEnter={() => setHighlight(ranked.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              void doCreate();
            }}
          >
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
              Mutual
            </label>
          </div>
        )}
        {ranked.length === 0 && !offerCreate && (
          <div className="relationship-bubble-empty">No matching option</div>
        )}
      </div>
    </div>
  );
}
