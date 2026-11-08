import type { CSSProperties } from 'react';
import type { OptionChip } from '../../domain/categorical';
import { HighlightText } from '../highlight-text';
import './option-chip.css';

/** A tag option as a coloured pill, with the search query's matches highlighted. */
export function OptionChipView({ chip, query = '' }: { chip: OptionChip; query?: string }) {
  const style = { '--rel-tag-colour': chip.colour } as CSSProperties;
  return (
    <span className="rel-tag-chip" style={style}>
      <HighlightText text={chip.label} query={query} />
    </span>
  );
}
