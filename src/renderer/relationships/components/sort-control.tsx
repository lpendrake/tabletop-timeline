import type { RowSort, SortMode } from '../domain/sort';
import './toolbar.css';

export interface SortControlProps {
  modes: Array<{ mode: SortMode; label: string }>;
  active: RowSort;
  onChange: (mode: SortMode) => void;
}

/** Segmented control choosing the row sort mode; nothing when the track offers no modes. */
export function SortControl({ modes, active, onChange }: SortControlProps) {
  if (modes.length === 0) return null;
  return (
    <div className="rel-sort" role="group" aria-label="Sort">
      {modes.map((m) => (
        <button
          key={m.mode}
          type="button"
          className={`rel-sort-option${m.mode === active ? ' is-active' : ''}`}
          aria-pressed={m.mode === active}
          onClick={() => onChange(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
