import { CategoricalTrackSpec } from '../spec.js';

export const RELATIONSHIP_TAGS_ID = 'tg01';

export const relationshipTagsSpec: CategoricalTrackSpec = {
  kind: 'categorical',
  id: RELATIONSHIP_TAGS_ID,
  name: 'Relationship tags',
  options: [
    { key: 'member', label: 'member', mutual: false },
    { key: 'employee', label: 'employee', mutual: false },
    { key: 'customer', label: 'customer', mutual: false },
    { key: 'hates', label: 'hates', mutual: false },
    { key: 'married', label: 'married', mutual: true },
    { key: 'business-partner', label: 'business partner', mutual: true },
  ],
  actions: [
    {
      key: 'gains',
      label: 'Gains',
      kind: 'add',
      template: 'Give {holder} relationship: {option} → {observer} — {reason}',
    },
    {
      key: 'loses',
      label: 'Loses',
      kind: 'remove',
      template: "Remove {holder}'s relationship: {option} → {observer} — {reason}",
    },
  ],
};
