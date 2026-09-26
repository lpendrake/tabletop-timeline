import { NumericTrackSpec } from '../spec.js';

export const PF2E_REPUTATION_ID = 'rp01';

export const pf2eReputationSpec: NumericTrackSpec = {
  kind: 'numeric',
  id: PF2E_REPUTATION_ID,
  name: 'PF2E Reputation',
  min: -50,
  max: 50,
  initial: 0,
  step: 1,
  showValue: true,
  bands: [
    { key: 'hunted', label: 'Hunted', start: -50 },
    { key: 'hated', label: 'Hated', start: -29 },
    { key: 'disliked', label: 'Disliked', start: -14 },
    { key: 'ignored', label: 'Ignored', start: -4 },
    { key: 'liked', label: 'Liked', start: 5 },
    { key: 'admired', label: 'Admired', start: 15 },
    { key: 'revered', label: 'Revered', start: 30 },
  ],
  actions: [
    {
      key: 'change',
      label: 'Change',
      kind: 'adjust',
      template: 'Rep change: {amount:Reputation change} {observer} rep for {holder} — {reason}',
    },
    {
      key: 'set',
      label: 'Set',
      kind: 'set',
      template: "Rep set: {holder}'s rep with {observer} is {value} — {reason}",
    },
  ],
};
