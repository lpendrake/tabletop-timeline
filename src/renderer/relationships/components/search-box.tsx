import type { SearchScope } from '../domain/search';
import './toolbar.css';

export interface SearchBoxProps {
  query: string;
  onQueryChange: (query: string) => void;
  countLabel: string | null;
  scopes: Array<{ scope: SearchScope; label: string; enabled: boolean }>;
  onToggleScope: (scope: SearchScope) => void;
}

/** Search input with match count, clear button and per-scope toggle chips. */
export function SearchBox({
  query,
  onQueryChange,
  countLabel,
  scopes,
  onToggleScope,
}: SearchBoxProps) {
  return (
    <div className="rel-search">
      <div className="rel-search-field">
        <input
          type="text"
          className="rel-search-input"
          value={query}
          placeholder="Search..."
          aria-label="Search relationships"
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query !== '' && (
          <>
            {countLabel && <span className="rel-search-count">{countLabel}</span>}
            <button
              type="button"
              className="rel-search-clear"
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
            >
              ×
            </button>
          </>
        )}
      </div>
      <div className="rel-scopes">
        {scopes.map((s) => (
          <button
            key={s.scope}
            type="button"
            className={`rel-scope${s.enabled ? ' is-on' : ''}`}
            aria-pressed={s.enabled}
            onClick={() => onToggleScope(s.scope)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
