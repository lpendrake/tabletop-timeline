import { useId } from 'react';
import type { CategoricalGroupBy } from '../../domain/categorical';
import { SegmentedControl } from '../segmented-control';

const OPTIONS: Array<{ value: CategoricalGroupBy; label: string }> = [
  { value: 'holder', label: 'Holder' },
  { value: 'tag', label: 'Tag' },
];

export interface GroupBySwitchProps {
  groupBy: CategoricalGroupBy;
  onChange: (groupBy: CategoricalGroupBy) => void;
}

/** Segmented switch choosing whether table rows are grouped by holder or by tag. */
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
