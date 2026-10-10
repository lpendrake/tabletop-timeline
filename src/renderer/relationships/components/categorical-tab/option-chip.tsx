import type { CSSProperties } from 'react';
import type { OptionChip } from '../../domain/categorical';
import './option-chip.css';

/** A tag option as a coloured pill. */
export function OptionChipView({ chip }: { chip: OptionChip }) {
  const style = { '--rel-tag-colour': chip.colour } as CSSProperties;
  return (
    <span className="rel-tag-chip" style={style}>
      {chip.label}
    </span>
  );
}
