import {
  EMPTY_TRACK_LIBRARY,
  resolveTrack,
  type Ledger,
  type RelationshipDelta,
  type TagTrack,
} from '../../../../shared/relationships';
import { buildBaseRows } from '../view-rows';
import { buildCategoricalEntries } from '../categorical';
import { defaultViewOrder } from '../view-order';

/** The built-in relationship tags: member, employee, customer, hates; mutual married, business-partner. */
export const tags = resolveTrack('tg01', EMPTY_TRACK_LIBRARY) as TagTrack;

export const NAMES: Record<string, string> = {
  zara: 'Zara',
  anna: 'Anna',
  mira: 'Mira',
  dax: 'Dax',
  guild: 'Thieves Guild',
  inn: 'Rusty Inn',
};
export const labelFor = (id: string) => NAMES[id] ?? id;

export const NOW = 1000;

export const viewOrder = defaultViewOrder;

/** A tag delta; undated and declared in `notes/x.md` unless overridden. */
export function tagDelta(
  op: 'add' | 'remove',
  key: string,
  over: Partial<RelationshipDelta> = {},
): RelationshipDelta {
  return {
    op,
    key,
    at: null,
    declaredIn: { path: 'notes/x.md', ordinal: 0 },
    ...over,
  } as RelationshipDelta;
}

export function ledger(holder: string, observer: string, deltas: RelationshipDelta[]): Ledger {
  return { holder, observer, track: tags.id, deltas };
}

/** `holder` holds `key` toward `observer` (undated baseline unless overridden). */
export function holds(
  holder: string,
  observer: string,
  key: string,
  over: Partial<RelationshipDelta> = {},
): Ledger {
  return ledger(holder, observer, [tagDelta('add', key, over)]);
}

/** A mutual option declared once: the direct ledger plus its mirrored reverse. */
export function mutualPair(
  a: string,
  b: string,
  key: string,
  over: Partial<RelationshipDelta> = {},
): [Ledger, Ledger] {
  return [
    ledger(a, b, [tagDelta('add', key, over)]),
    ledger(b, a, [tagDelta('add', key, { ...over, mirrored: true })]),
  ];
}

export function entriesFor(ledgers: Ledger[], now = NOW) {
  const rows = buildBaseRows({
    ledgers,
    track: tags,
    trackId: tags.id,
    now,
    titleByPath: new Map(),
    labelFor,
  });
  return buildCategoricalEntries(rows, tags, labelFor);
}
