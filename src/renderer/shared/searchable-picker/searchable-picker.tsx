import { useEffect, useMemo, useRef, useState } from 'react';
import { moveHighlight, rankPickerOptions, type PickerOption } from './picker-model';
import './searchable-picker.css';

/**
 * An extra, keyboard-reachable row appended after the ranked results — e.g.
 * a "Create …" action for an unmatched query. It's a full participant in
 * the same highlight/Arrow/Enter/mousedown handling as every other row
 * (see `rowCount` below), which is what keeps it reachable without a
 * separate, unmemoized listbox reimplementation drifting out of sync with
 * the highlight — see this component's own AGENTS.md.
 */
export interface SearchablePickerCreateRow {
  /** Whether to show the row at all, given the current query/options (e.g. `shouldOfferCreateOption`). */
  show: boolean;
  /** The row's content. Called fresh on every render, so it can read the caller's own query/checkbox state. */
  render: () => React.ReactNode;
  onPick: () => void;
}

export interface SearchablePickerProps {
  options: readonly PickerOption[];
  recentIds?: readonly string[];
  /** Currently chosen option id (highlighted when the query is empty). */
  value?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onPick: (option: PickerOption) => void;
  onCancel?: () => void;
  /** Called with the raw query text on every change — for a caller that needs to know it (e.g. to decide a create-row). */
  onQueryChange?: (query: string) => void;
  emptyText?: string;
  ariaLabel?: string;
  /** An extra row appended after the ranked results — see `SearchablePickerCreateRow`. */
  createRow?: SearchablePickerCreateRow;
  /** Caps the option list's height (px), e.g. so a caller-computed placement fits on screen. Omit to use the list's own CSS default. */
  listMaxHeight?: number;
  /**
   * Overrides the default `rankPickerOptions` ranking — e.g. `NotePickerField`
   * passes one built on `shared/entity-match.ts`'s title/id matcher, so note
   * pickers find notes the same way the `@` link search does instead of via
   * `rankPickerOptions`'s file-path matching (built for the New Note folder
   * picker). Defaults to `rankPickerOptions` when omitted.
   */
  rank?: (
    options: readonly PickerOption[],
    query: string,
    recentIds?: readonly string[],
  ) => PickerOption[];
  /**
   * Attached to the rendered option list element — lets a caller (e.g.
   * `relationship-bubble-view-plugin.ts`, which measures the list's and its
   * first row's real height to plan the bubble's placement) hold a
   * reference to it instead of querying the DOM for `.searchable-picker-list`
   * or `.searchable-picker-row`. Merged with this component's own internal
   * ref, so both receive the same node.
   */
  listRef?: React.Ref<HTMLDivElement>;
}

/** Assigns `value` to a ref, whether it's a callback ref or a ref object. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as React.MutableRefObject<T | null>).current = value;
}

/**
 * A search input over a ranked, path-aware list of options. See
 * `picker-model.ts` for the ranking logic — this component only holds UI
 * state (the query and the highlighted row).
 */
export function SearchablePicker({
  options,
  recentIds,
  value,
  placeholder,
  autoFocus,
  inputRef,
  onPick,
  onCancel,
  onQueryChange,
  emptyText = 'No matches',
  ariaLabel,
  createRow,
  listMaxHeight,
  listRef,
  rank = rankPickerOptions,
}: SearchablePickerProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const internalListRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => rank(options, query, recentIds), [rank, options, query, recentIds]);
  const showCreateRow = Boolean(createRow?.show);
  const rowCount = results.length + (showCreateRow ? 1 : 0);

  useEffect(() => {
    if (rowCount === 0) {
      setHighlight(-1);
      return;
    }
    if (!query.trim() && value) {
      const valueIndex = results.findIndex((option) => option.id === value);
      if (valueIndex !== -1) {
        setHighlight(valueIndex);
        return;
      }
    }
    setHighlight(0);
    // Only recompute the initial highlight when the result set (or the
    // create row's presence) changes — not on every highlight move, which
    // is what keeps Arrow keys from snapping back mid-navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, showCreateRow]);

  useEffect(() => {
    if (highlight < 0) return;
    const list = internalListRef.current;
    if (!list) return;
    const row = list.children[highlight] as HTMLElement | undefined;
    if (row?.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (showCreateRow && highlight === results.length) {
        createRow?.onPick();
        return;
      }
      const picked = results[highlight];
      if (picked) onPick(picked);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel?.();
      return;
    }
  }

  return (
    <div className="searchable-picker">
      <input
        ref={inputRef}
        className="searchable-picker-input"
        type="text"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        className="searchable-picker-list"
        role="listbox"
        ref={(node) => {
          internalListRef.current = node;
          assignRef(listRef, node);
        }}
        style={listMaxHeight !== undefined ? { maxHeight: listMaxHeight } : undefined}
      >
        {results.length === 0 && !showCreateRow && (
          <div className="searchable-picker-empty">{emptyText}</div>
        )}
        {results.map((option, index) => (
          <div
            key={option.id}
            role="option"
            aria-selected={index === highlight}
            className={`searchable-picker-row${index === highlight ? ' is-highlighted' : ''}`}
            onMouseEnter={() => setHighlight(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(option);
            }}
          >
            {option.label ?? option.path}
          </div>
        ))}
        {showCreateRow && (
          <div
            role="option"
            aria-selected={highlight === results.length}
            className={`searchable-picker-row searchable-picker-create-row${
              highlight === results.length ? ' is-highlighted' : ''
            }`}
            onMouseEnter={() => setHighlight(results.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              createRow?.onPick();
            }}
          >
            {createRow?.render()}
          </div>
        )}
      </div>
    </div>
  );
}
