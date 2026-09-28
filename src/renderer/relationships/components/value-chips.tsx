import type { ChipsDisplay } from '../domain';

export function ValueChips({ display }: { display: ChipsDisplay }) {
  return (
    <div className="rel-value-chips">
      {display.chips.map((chip) => (
        <span
          key={chip.key}
          className={`rel-value-chip${chip.mutual ? ' rel-value-chip-mutual' : ''}`}
          title={chip.mutual ? 'mutual' : undefined}
          aria-label={chip.mutual ? `${chip.label} (mutual)` : undefined}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}
