import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  flattenGroups,
  groupPickerOptions,
  highlightSegments,
  moveHighlight,
  type PickerOption,
} from './picker-model';
import './searchable-picker.css';

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
  emptyText?: string;
  ariaLabel?: string;
  /** Options shown first in a labelled group; also enables group headers. */
  pinned?: PickerOption[];
  pinnedLabel?: string;
  allLabel?: string;
  /** Wrap the typed text in matching labels with `<mark>`. */
  highlightMatches?: boolean;
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
  emptyText = 'No matches',
  ariaLabel,
  pinned,
  pinnedLabel = 'Pinned',
  allLabel = 'All',
  highlightMatches,
}: SearchablePickerProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => groupPickerOptions(options, query, { pinned, recentIds, pinnedLabel, allLabel }),
    [options, query, recentIds, pinned, pinnedLabel, allLabel],
  );
  const results = useMemo(() => flattenGroups(groups), [groups]);
  const showHeaders = pinned !== undefined;
  const showMatches = highlightMatches === true && query.trim() !== '';
  const rowCount = results.length;

  useEffect(() => {
    if (rowCount === 0) {
      setHighlight(-1);
      return;
    }
    if (!query.trim() && value) {
      const valueIndex = results.findIndex((entry) => entry.option.id === value);
      if (valueIndex !== -1) {
        setHighlight(valueIndex);
        return;
      }
    }
    setHighlight(0);
    // Only recompute the initial highlight when the result set changes —
    // not on every highlight move, which is what keeps Arrow keys from
    // snapping back mid-navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  useEffect(() => {
    if (highlight < 0) return;
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
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
      const picked = results[highlight];
      if (picked) onPick(picked.option);
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
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="searchable-picker-list" role="listbox" ref={listRef}>
        {results.length === 0 && <div className="searchable-picker-empty">{emptyText}</div>}
        {groups.map((group) => (
          <Fragment key={group.key}>
            {showHeaders && (
              <div className="searchable-picker-group" role="presentation">
                {group.label}
              </div>
            )}
            {results
              .filter((entry) => entry.groupKey === group.key)
              .map(({ index, option }) => (
                <div
                  key={`${group.key}:${option.id}`}
                  role="option"
                  data-index={index}
                  aria-selected={index === highlight}
                  className={`searchable-picker-row${index === highlight ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(option);
                  }}
                >
                  <span className="searchable-picker-label">
                    {showMatches
                      ? highlightSegments(option.label ?? option.path, query).map((seg, i) =>
                          seg.match ? (
                            <mark key={i} className="searchable-picker-match">
                              {seg.text}
                            </mark>
                          ) : (
                            <Fragment key={i}>{seg.text}</Fragment>
                          ),
                        )
                      : (option.label ?? option.path)}
                  </span>
                  {option.count !== undefined && (
                    <span className="searchable-picker-count">{option.count}</span>
                  )}
                </div>
              ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
