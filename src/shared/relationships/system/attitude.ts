import { OrdinalTrackSpec } from '../spec.js';

export const ATTITUDE_ID = 'at01';

export const attitudeSpec: OrdinalTrackSpec = {
  kind: 'ordinal',
  id: ATTITUDE_ID,
  name: 'Attitude',
  initial: 'indifferent',
  rungs: [
    { key: 'hostile', label: 'Hostile' },
    { key: 'unfriendly', label: 'Unfriendly' },
    { key: 'indifferent', label: 'Indifferent' },
    { key: 'friendly', label: 'Friendly' },
    { key: 'helpful', label: 'Helpful' },
  ],
  actions: [
    {
      key: 'shift',
      label: 'Shift',
      kind: 'adjust',
      template: 'Attitude shift: {holder} moves {amount:Steps} with {observer} — {reason}',
    },
    {
      key: 'set',
      label: 'Set',
      kind: 'set',
      template: 'Attitude: {observer} is {value} toward {holder} — {reason}',
    },
  ],
};
