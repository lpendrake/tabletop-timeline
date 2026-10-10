import { useId } from 'react';
import type { CategoricalGroupBy } from '../../domain/categorical';
import { SegmentedControl } from '../segmented-control';

const OPTIONS: Array<{ value: CategoricalGroupBy; label: string }> = [
  { value: 'tag', label: 'Tag' },
  { value: 'entity', label: 'Entity' },
];

export interface GroupBySwitchProps {
  groupBy: CategoricalGroupBy;
  onChange: (groupBy: CategoricalGroupBy) => void;
}

/** Segmented switch choosing whether cards are grouped by tag or by entity. */
export function GroupBySwitch({ groupBy, onChange }: GroupBySwitchProps) {
  const captionId = useId();
  return (
    <div className="rel-groupby">
      <span id={captionId} className="rel-groupby-caption">
        Group by
      </span>
      <SegmentedControl
        labelledBy={captionId}
        options={OPTIONS}
        active={groupBy}
        onChange={onChange}
      />
    </div>
  );
}
