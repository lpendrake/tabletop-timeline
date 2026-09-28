import type { BarDisplay } from '../domain';

export function ValueBar({ display }: { display: BarDisplay }) {
  return (
    <div className="rel-value-bar-wrap">
      <div className="rel-value-bar">
        {display.bands.map((band) => (
          <div
            key={band.key}
            className="rel-value-bar-tick"
            style={{ left: `${band.startFraction * 100}%` }}
            title={band.label}
          />
        ))}
        <div className="rel-value-bar-fill" style={{ width: `${display.fraction * 100}%` }} />
      </div>
      <span className="rel-value-bar-label">{display.label}</span>
    </div>
  );
}
