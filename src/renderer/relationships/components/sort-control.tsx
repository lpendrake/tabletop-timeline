import type { SortMode } from '../domain/sort';
import './toolbar.css';

export interface SortControlProps {
  modes: Array<{ mode: SortMode; label: string }>;
  active: SortMode;
  onChange: (mode: SortMode) => void;
}

/** Segmented control choosing the row sort mode. */
export function SortControl({ modes, active, onChange }: SortControlProps) {
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
