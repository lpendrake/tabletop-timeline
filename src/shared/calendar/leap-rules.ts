export interface LeapRule {
  id: string;
  name: string;
  isLeap(year: number): boolean;
  extraDays(year: number): number;
  /** Length of a repeating cycle in years, when applicable (used for O(1) bulk-year sums). */
  period?: number;
}

export const NO_OP_RULE: LeapRule = {
  id: 'none',
  name: 'No leap rule',
  isLeap: () => false,
  extraDays: () => 0,
};

export const GREGORIAN_RULE: LeapRule = {
  id: 'gregorian',
  name: 'Gregorian (4/100/400)',
  period: 400,
  isLeap: (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0,
  extraDays: (y: number) => (GREGORIAN_RULE.isLeap(y) ? 1 : 0),
};

const KNOWN_RULES: LeapRule[] = [NO_OP_RULE, GREGORIAN_RULE];

/**
 * Look up a LeapRule by id.
 * Returns NO_OP_RULE for any unknown ruleId so that the engine degrades gracefully.
 */
export function resolveLeapRule(ruleId: string): LeapRule {
  return KNOWN_RULES.find((r) => r.id === ruleId) ?? NO_OP_RULE;
}
