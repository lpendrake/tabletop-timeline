import type { ValueDisplay } from '../domain';
import { ValueBar } from './value-bar';
import { ValueLadder } from './value-ladder';
import { ValueChips } from './value-chips';

/** Dispatches a `ValueDisplay` to the matching renderer. */
export function TrackValue({ display }: { display: ValueDisplay }) {
  if (display.kind === 'bar') return <ValueBar display={display} />;
  if (display.kind === 'ladder') return <ValueLadder display={display} />;
  if (display.kind === 'chips') return <ValueChips display={display} />;
  return <span className="rel-value-number">{display.label}</span>;
}
