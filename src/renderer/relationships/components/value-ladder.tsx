import type { LadderDisplay } from '../domain';

export function ValueLadder({ display }: { display: LadderDisplay }) {
  return (
    <div className="rel-value-ladder">
      {display.rungs.map((rung) => (
        <span
          key={rung.key}
          className={`rel-value-rung${rung.active ? ' rel-value-rung-active' : ''}`}
        >
          {rung.label}
        </span>
      ))}
    </div>
  );
}
