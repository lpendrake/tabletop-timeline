import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Role, ResolvedTrack } from '../../../../shared/relationships';
import { SearchablePicker, type PickerOption } from '../../searchable-picker';
import {
  buildNotePickerRecents,
  filterHeldOptions,
  initialNumberFieldValue,
  isAllowedNumberInputText,
  prefillNoteValue,
  rankNoteOptions,
  rankPickerOptions,
  shouldNotifyHolderChosen,
  shouldOfferCreateOption,
  stepAmount,
  stepNumericValue,
  type FieldKind,
} from './relationship-directive-form-logic';
import './relationship-directive-form.css';

export interface RelationshipDirectiveFormFieldProps {
  role: Role;
  kind: FieldKind;
  /** The field's current draft value — the raw, user-facing representation (a bare note id for holder/observer, not `[[id]]`). */
  value: string;
  prompt: string;
  /** Set only after a Save attempt fails validation for this field. */
  error: string | null;
  track: ResolvedTrack | null;
  trackId: string;
  defaultReason: string;
  noteOptions: readonly PickerOption[];
  recentNoteIds: readonly string[];
  defaultHolderId: string | null;
  currentNoteId: string | null;
  heldOptionKeys: string[] | null;
  heldOptionsLoading: boolean;
  restrictedNoteIds: string[] | null;
  restrictedNoteIdsLoading: boolean;
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  onChange: (value: string) => void;
}

export interface RelationshipDirectiveFormProps {
  /** The open directive's `from` — identifies which directive this form belongs to. */
  anchor: number;
  /** Every field of the directive's action, in template order. */
  fields: readonly RelationshipDirectiveFormFieldProps[];
  /** Which role's field should take focus once the form is shown: the first empty blank, or the first field. */
  focusRole: Role | null;
  onSave: () => void;
  onCancel: () => void;
  style: React.CSSProperties;
  /** Caps the form's own height so it fits on screen; the form scrolls internally beyond that. `null` = no cap needed. */
  maxHeight: number | null;
  /**
   * False for the initial hidden measuring pass (see
   * `relationship-directive-form-plugin.ts`'s `render`), true once
   * repositioned and shown. Fields use this — not a plain mount-time
   * `autoFocus` — to grab focus reliably.
   */
  visible: boolean;
  /**
   * Held by `relationship-directive-form-plugin.ts` and attached to the
   * rendered `.relationship-directive-form` element, so the plugin can
   * measure the form's own real width/height off this reference for
   * placement — never a selector lookup.
   */
  formRef: React.Ref<HTMLDivElement>;
}

/**
 * Focuses `ref`'s element once the form is `visible`. No-op while hidden —
 * a `visibility: hidden` element can't take real browser focus.
 */
function useFieldFocus<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  shouldFocus: boolean,
): void {
  useLayoutEffect(() => {
    if (!shouldFocus) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return undefined;
  }, [shouldFocus, ref]);
}

/**
 * The form popover itself: every field of one directive's action, in
 * template order, plus Save/Cancel. Mounted by
 * `relationship-directive-form-plugin.ts` outside `view.dom`. Renders
 * only — every decision (validation, held-option filtering, the Create-row
 * check, placement) is a pure function from `relationship-directive-form-logic.ts`
 * or computed by the plugin.
 */
export function RelationshipDirectiveForm(
  props: RelationshipDirectiveFormProps,
): React.ReactElement {
  const { style, maxHeight, visible, anchor, fields, focusRole, onSave, onCancel, formRef } = props;

  /**
   * Each field's focusable element, by index — populated by every field's
   * `registerFocusable` on render, read only by a later field's own Enter
   * handler to move focus to the next one. A held ref (per form instance),
   * never a `querySelector`.
   */
  const fieldOrderRef = useRef<(HTMLElement | null)[]>([]);

  function handleKeyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="relationship-directive-form"
      style={{ ...style, maxHeight: maxHeight ?? undefined }}
      ref={formRef}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <div className="relationship-directive-form-fields">
        {fields.map((field, index) => (
          <FormField
            key={`${anchor}:${field.role}`}
            {...field}
            autoFocus={visible && field.role === focusRole}
            isLast={index === fields.length - 1}
            onEnterNext={() => {
              if (index === fields.length - 1) {
                onSave();
                return;
              }
              fieldOrderRef.current[index + 1]?.focus();
            }}
            registerFocusable={(el) => {
              fieldOrderRef.current[index] = el;
            }}
          />
        ))}
      </div>
      <div className="relationship-directive-form-actions">
        <button type="button" className="relationship-directive-form-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="relationship-directive-form-save" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

interface FormFieldProps extends RelationshipDirectiveFormFieldProps {
  autoFocus: boolean;
  isLast: boolean;
  onEnterNext: () => void;
  registerFocusable: (el: HTMLElement | null) => void;
}

function FormField(props: FormFieldProps): React.ReactElement {
  const { prompt, error } = props;
  return (
    <div className="relationship-directive-form-field-row">
      <div className="relationship-directive-form-field-prompt">{prompt}</div>
      <Field {...props} />
      {error && <div className="relationship-directive-form-message">{error}</div>}
    </div>
  );
}

function Field(props: FormFieldProps): React.ReactElement {
  const { kind, track } = props;
  if (kind === 'amount') {
    return (
      <NumberField
        {...props}
        step={(raw, dir) =>
          track ? stepAmount(raw, track, dir) : String((Number(raw) || 0) + dir)
        }
      />
    );
  }
  if (kind === 'ordinal-value' && track?.kind === 'ordinal')
    return <RungField {...props} track={track} />;
  if (kind === 'numeric-value' && track) {
    return <NumberField {...props} step={(raw, dir) => stepNumericValue(raw, track, dir)} />;
  }
  if (kind === 'note') return <NotePickerField {...props} />;
  if (kind === 'categorical-option' && track?.kind === 'categorical')
    return <OptionField {...props} track={track} />;
  if (kind === 'reason') return <ReasonField {...props} />;
  return <div className="relationship-directive-form-error">Unsupported field</div>;
}

interface NumberFieldProps extends FormFieldProps {
  step: (raw: string, dir: 1 | -1) => string;
}

function NumberField({
  role,
  value,
  track,
  onChange,
  onEnterNext,
  registerFocusable,
  autoFocus,
  step,
}: NumberFieldProps) {
  const [text, setText] = useState(() => initialNumberFieldValue(role, value, track));
  const ref = useRef<HTMLInputElement>(null);
  useFieldFocus(ref, autoFocus);

  function commit(next: string) {
    setText(next);
    onChange(next);
  }

  function applyStep(dir: 1 | -1) {
    commit(step(text || '0', dir));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnterNext();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyStep(1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyStep(-1);
    }
  }

  return (
    <div className="relationship-directive-form-number-row">
      <input
        ref={(el) => {
          ref.current = el;
          registerFocusable(el);
        }}
        className="relationship-directive-form-input"
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          if (!isAllowedNumberInputText(next, track)) return;
          commit(next);
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="relationship-directive-form-stepper">
        <button
          type="button"
          className="relationship-directive-form-stepper-button"
          tabIndex={-1}
          aria-label="Increase"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStep(1)}
        >
          ▲
        </button>
        <button
          type="button"
          className="relationship-directive-form-stepper-button"
          tabIndex={-1}
          aria-label="Decrease"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStep(-1)}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

function ReasonField({
  value,
  defaultReason,
  onChange,
  onEnterNext,
  registerFocusable,
  autoFocus,
}: FormFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  useFieldFocus(ref, autoFocus);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnterNext();
    }
  }

  return (
    <input
      ref={(el) => {
        ref.current = el;
        registerFocusable(el);
      }}
      className="relationship-directive-form-input"
      type="text"
      placeholder={defaultReason}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

function NotePickerField(props: FormFieldProps) {
  const {
    value,
    noteOptions,
    recentNoteIds,
    defaultHolderId,
    currentNoteId,
    role,
    onChange,
    registerFocusable,
    autoFocus,
    restrictedNoteIds,
    restrictedNoteIdsLoading,
    onHolderChosenWithoutDefault,
  } = props;
  const ref = useRef<HTMLInputElement>(null);
  useFieldFocus(ref, autoFocus);

  const options = filterHeldOptions(noteOptions, restrictedNoteIds);
  const recents = buildNotePickerRecents(recentNoteIds, currentNoteId);
  const prefilled = prefillNoteValue(role, value, defaultHolderId);

  async function commitPick(id: string): Promise<void> {
    if (shouldNotifyHolderChosen(role, defaultHolderId)) {
      await onHolderChosenWithoutDefault?.(id);
    }
    onChange(id);
  }

  if (restrictedNoteIdsLoading) {
    return <div className="relationship-directive-form-loading">Loading…</div>;
  }

  return (
    <SearchablePicker
      options={options}
      recentIds={recents}
      value={prefilled ?? null}
      inputRef={(el) => {
        ref.current = el;
        registerFocusable(el);
      }}
      placeholder={role === 'holder' ? 'Holder…' : 'Observer…'}
      ariaLabel={role}
      rank={rankNoteOptions}
      onPick={(option) => void commitPick(option.id)}
    />
  );
}

function RungField(props: FormFieldProps & { track: Extract<ResolvedTrack, { kind: 'ordinal' }> }) {
  const { value, track, onChange, registerFocusable, autoFocus } = props;
  const ref = useRef<HTMLInputElement>(null);
  useFieldFocus(ref, autoFocus);
  const options: PickerOption[] = track.rungs.map((r) => ({
    id: r.key,
    path: r.label,
    label: r.label,
  }));

  return (
    <SearchablePicker
      options={options}
      value={value || null}
      inputRef={(el) => {
        ref.current = el;
        registerFocusable(el);
      }}
      placeholder="Choose a level…"
      ariaLabel="value"
      onPick={(option) => onChange(option.id)}
    />
  );
}

function OptionField(
  props: FormFieldProps & { track: Extract<ResolvedTrack, { kind: 'categorical' }> },
) {
  const {
    value,
    track,
    trackId,
    heldOptionKeys,
    heldOptionsLoading,
    createOption,
    onChange,
    registerFocusable,
    autoFocus,
  } = props;
  const [query, setQuery] = useState('');
  const [mutual, setMutual] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useFieldFocus(ref, autoFocus);

  const allOptions: PickerOption[] = track.options.map((o) => ({
    id: o.key,
    path: o.label,
    label: o.label,
  }));
  const options = filterHeldOptions(allOptions, heldOptionKeys);
  const offerCreate = Boolean(createOption) && shouldOfferCreateOption(query, options);

  async function doCreate() {
    if (!createOption || creating) return;
    setCreating(true);
    try {
      const result = await createOption(trackId, query.trim(), mutual);
      if (result) onChange(result.key);
    } finally {
      setCreating(false);
    }
  }

  if (heldOptionsLoading) {
    return <div className="relationship-directive-form-loading">Loading…</div>;
  }

  return (
    <SearchablePicker
      options={options}
      value={value || null}
      inputRef={(el) => {
        ref.current = el;
        registerFocusable(el);
      }}
      placeholder="Choose an option…"
      ariaLabel="option"
      emptyText="No matching option"
      rank={rankPickerOptions}
      onQueryChange={setQuery}
      onPick={(option) => onChange(option.id)}
      createRow={
        createOption
          ? {
              show: offerCreate,
              render: () => (
                <>
                  <span>Create &quot;{query.trim()}&quot;</span>
                  <label
                    className="relationship-directive-form-mutual-label"
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
  );
}
