import type { CSSProperties } from 'react';

/** An inline `style` that sets CSS custom properties, e.g. `cssVars({ '--rel-num-colour': colour })`. */
export function cssVars(vars: Record<`--${string}`, string>): CSSProperties {
  return vars as CSSProperties;
}
