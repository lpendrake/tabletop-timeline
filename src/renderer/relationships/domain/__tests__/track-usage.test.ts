import { describe, it, expect } from 'vitest';
import {
  attitudeSpec,
  relationshipTagsSpec,
  EMPTY_TRACK_LIBRARY,
  type Ledger,
} from '../../../../shared/relationships';
import { trackUsageProximity } from '../track-usage';

const trackId = relationshipTagsSpec.id;
const DAY = 86400;

function ledger(holder: string, observer: string, deltas: Ledger['deltas']): Ledger {
  return { holder, observer, track: trackId, deltas };
}

function gains(holder: string, option: string, observer: string): string {
  return `{{${trackId}.gains {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:}}}`;
}

function attitudeSet(holder: string, observer: string): string {
  return `{{${attitudeSpec.id}.set {observer:[[${observer}]]} is {value:friendly} toward {holder:[[${holder}]]} — {reason:}}}`;
}

function usage(overrides: Partial<Parameters<typeof trackUsageProximity>[0]>) {
  return trackUsageProximity({
    ledgers: [],
    library: EMPTY_TRACK_LIBRARY,
    trackId,
    path: 'events/e.md',
    doc: '',
    isEvent: true,
    at: 2 * DAY,
    excludeOrdinal: undefined,
    ...overrides,
  });
}

describe('trackUsageProximity', () => {
  it('lists holders and observers used on the track', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
    ];

    const result = usage({ ledgers });

    expect([...result.keys()].sort()).toEqual(['haaa', 'oaaa']);
  });

  it('ignores ledgers on other tracks', () => {
    const ledgers: Ledger[] = [
      {
        holder: 'haaa',
        observer: 'oaaa',
        track: 'other-track',
        deltas: [
          { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
        ],
      },
    ];

    expect(usage({ ledgers }).size).toBe(0);
  });

  it("uses the nearest entry's absolute distance", () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
        { op: 'add', key: 'hates', at: 10 * DAY, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    // Event at day 2: nearest entry is day 1 (before the event).
    expect(usage({ ledgers, at: 2 * DAY }).get('haaa')).toBe(DAY);
    // Event at day 11: nearest entry is day 10 (after the event).
    expect(usage({ ledgers, at: 11 * DAY }).get('haaa')).toBe(DAY);
    // Event at day 5: nearest is day 1, distance 4 days.
    expect(usage({ ledgers, at: 5 * DAY }).get('haaa')).toBe(4 * DAY);
  });

  it('entries before and after the event tie', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
        { op: 'add', key: 'hates', at: 3 * DAY, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const result = usage({ ledgers, at: 2 * DAY });

    expect(result.get('haaa')).toBe(DAY);
    expect(result.get('oaaa')).toBe(DAY);
  });

  it('dateless (note) entries count as used with null proximity', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/n.md', ordinal: 0 } },
      ]),
    ];

    const result = usage({ ledgers });

    expect(result.has('haaa')).toBe(true);
    expect(result.get('haaa')).toBeNull();
    expect(result.get('oaaa')).toBeNull();
  });

  it('a dated entry beats a dateless one for the same note', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/n.md', ordinal: 0 } },
        { op: 'add', key: 'hates', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
    ];

    expect(usage({ ledgers, at: 2 * DAY }).get('haaa')).toBe(DAY);
  });

  it('a null declaring date gives every used note null proximity', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
    ];

    const result = usage({ ledgers, at: null, isEvent: false });

    expect(result.get('haaa')).toBeNull();
    expect(result.get('oaaa')).toBeNull();
  });

  it('takes the nearest entry across ledgers where the note is holder in one and observer in another', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('oother', 'haaa', [
        { op: 'add', key: 'hates', at: 5 * DAY, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    // Event at day 4: the holder ledger's entry is 3 days away, the observer
    // ledger's entry is 1 day away.
    expect(usage({ ledgers, at: 4 * DAY }).get('haaa')).toBe(DAY);
  });

  it('excludes only the edited directive when the buffer has several', () => {
    const doc = [gains('haaa', 'member', 'oone'), gains('haaa', 'hates', 'otwo')].join('\n');

    const result = usage({ doc, excludeOrdinal: 1 });

    expect(result.has('oone')).toBe(true);
    expect(result.has('otwo')).toBe(false);
  });

  it('ignores buffer directives on other tracks', () => {
    const doc = attitudeSet('haaa', 'oaaa');

    expect(usage({ doc }).size).toBe(0);
  });

  it('an undated event buffer contributes nothing and hides its saved copy', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/e.md', ordinal: 0 } },
      ]),
    ];
    const doc = gains('haaa', 'hates', 'onew');

    const result = usage({ ledgers, doc, at: null, isEvent: true });

    expect(result.has('haaa')).toBe(false);
    expect(result.has('oaaa')).toBe(false);
    expect(result.has('onew')).toBe(false);
  });

  it('the directive being edited does not count', () => {
    const doc = gains('haaa', 'member', 'oedit');

    const result = usage({ doc, excludeOrdinal: 0 });

    expect(result.has('oedit')).toBe(false);
    expect(result.has('haaa')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('saved deltas for the current path are replaced by the buffer', () => {
    // The saved copy of this file used to link haaa with ostale; the buffer no
    // longer does, but it now links haaa with onew from another directive.
    const ledgers: Ledger[] = [
      ledger('haaa', 'ostale', [
        { op: 'add', key: 'member', at: 2 * DAY, declaredIn: { path: 'events/e.md', ordinal: 0 } },
      ]),
    ];
    const doc = gains('haaa', 'member', 'onew');

    const result = usage({ ledgers, doc });

    expect(result.has('ostale')).toBe(false);
    expect(result.has('onew')).toBe(true);
    expect(result.get('onew')).toBe(0);
  });

  it('an unfinished draft in the buffer does not count', () => {
    const doc = `{{${trackId}.gains {holder:[[haaa]]} is now {option:member} with {observer:} — {reason:}}}`;

    expect(usage({ doc }).size).toBe(0);
  });

  it("an unsaved buffer keeps all saved deltas and adds the buffer's", () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'osaved', [
        { op: 'add', key: 'member', at: DAY, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
    ];
    const doc = gains('haaa', 'member', 'onew');

    const result = usage({ ledgers, doc, path: null });

    expect(result.has('osaved')).toBe(true);
    expect(result.has('onew')).toBe(true);
  });

  it('mirrored deltas count both notes', () => {
    const ledgers: Ledger[] = [
      ledger('oaaa', 'haaa', [
        {
          op: 'add',
          key: 'married',
          at: DAY,
          declaredIn: { path: 'events/a.md', ordinal: 0 },
          mirrored: true,
        },
      ]),
    ];

    const result = usage({ ledgers });

    expect([...result.keys()].sort()).toEqual(['haaa', 'oaaa']);
    expect(result.get('oaaa')).toBe(DAY);
  });
});
