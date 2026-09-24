import { useEffect, useMemo, useRef, useState } from 'react';
import { moveHighlight, rankPickerOptions, type PickerOption } from './picker-model';

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
}: SearchablePickerProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => rankPickerOptions(options, query, recentIds),
    [options, query, recentIds],
  );

  useEffect(() => {
    if (results.length === 0) {
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
    // Only recompute the initial highlight when the result set itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  useEffect(() => {
    if (highlight < 0) return;
    const list = listRef.current;
    if (!list) return;
    const row = list.children[highlight] as HTMLElement | undefined;
    if (row?.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, results.length, 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, results.length, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
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
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="searchable-picker-list" role="listbox" ref={listRef}>
        {results.length === 0 ? (
          <div className="searchable-picker-empty">{emptyText}</div>
        ) : (
          results.map((option, index) => (
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
          ))
        )}
      </div>
    </div>
  );
}
