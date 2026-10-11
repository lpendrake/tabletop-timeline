import './toolbar.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Names the group: by its own text, or by the id of a visible caption. */
export type SegmentedLabel = { label: string } | { labelledBy: string };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  active: T;
  onChange: (value: T) => void;
} & SegmentedLabel;

/** Segmented control choosing one of several options; nothing when there are none. */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { options, active, onChange } = props;
  if (options.length === 0) return null;
  const naming =
    'labelledBy' in props ? { 'aria-labelledby': props.labelledBy } : { 'aria-label': props.label };
  return (
    <div className="rel-segmented" role="group" {...naming}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rel-segmented-option${option.value === active ? ' is-active' : ''}`}
          aria-pressed={option.value === active}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
