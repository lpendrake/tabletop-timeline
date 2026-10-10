import type { ReactNode } from 'react';
import {
  MUTUAL_LIMIT,
  isSearching,
  listLimit,
  visibleNames,
  type HolderName,
  type MutualPair,
} from '../../domain/categorical';
import { HighlightText } from '../highlight-text';

/** What a name click hands the tab: which entry, and the button to anchor to. */
export interface NameClick {
  entryKey: string;
  anchor: HTMLElement;
}

/** State and handlers shared by every name list of the tab. */
export interface NameListShared {
  query: string;
  /** Ids (`nameListId`) of the lists shown in full. */
  expanded: ReadonlySet<string>;
  toggleExpanded: (listId: string) => void;
  /** Entry whose popover is open, whose name is highlighted. */
  openEntryKey: string | null;
  onNameClick: (click: NameClick) => void;
}

interface NameButtonProps {
  name: HolderName;
  shared: NameListShared;
}

function NameButton({ name, shared }: NameButtonProps) {
  const open = shared.openEntryKey === name.entryKey;
  return (
    <button
      type="button"
      className={`rel-cat-name${open ? ' is-open' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => shared.onNameClick({ entryKey: name.entryKey, anchor: e.currentTarget })}
    >
      <HighlightText text={name.label} query={shared.query} />
    </button>
  );
}

interface TruncatedProps<T> {
  listId: string;
  items: readonly T[];
  limit: number;
  shared: NameListShared;
  renderItem: (item: T) => ReactNode;
}

/** Items up to `limit`, then a `+N more` button that becomes `show less`; a search shows them all. */
function Truncated<T>({ listId, items, limit, shared, renderItem }: TruncatedProps<T>) {
  const expanded = shared.expanded.has(listId);
  const searching = isSearching(shared.query);
  const { shown, hidden } = visibleNames(items, limit, { expanded, searching });
  let toggleLabel: string | null = null;
  if (hidden > 0) toggleLabel = `+${hidden} more`;
  else if (expanded && !searching && items.length > limit) toggleLabel = 'show less';
  return (
    <div className="rel-cat-names">
      {shown.map(renderItem)}
      {toggleLabel && (
        <button
          type="button"
          className="rel-cat-more"
          onClick={() => shared.toggleExpanded(listId)}
        >
          {toggleLabel}
        </button>
      )}
    </div>
  );
}

export interface NameListProps {
  listId: string;
  names: readonly HolderName[];
  mutual: boolean;
  shared: NameListShared;
}

/** The holders of one card row; mutual ones are prefixed ⇄. */
export function NameList({ listId, names, mutual, shared }: NameListProps) {
  return (
    <Truncated
      listId={listId}
      items={names}
      limit={listLimit(mutual)}
      shared={shared}
      renderItem={(name) => (
        <span key={name.entryKey} className="rel-cat-item">
          {mutual && (
            <span className="rel-cat-mutual-mark" aria-hidden="true">
              ⇄
            </span>
          )}
          <NameButton name={name} shared={shared} />
        </span>
      )}
    />
  );
}

export interface PairListProps {
  listId: string;
  pairs: readonly MutualPair[];
  shared: NameListShared;
}

/** A mutual tag's relationships, each once as `A ⇄ B` with both sides clickable. */
export function PairList({ listId, pairs, shared }: PairListProps) {
  return (
    <Truncated
      listId={listId}
      items={pairs}
      limit={MUTUAL_LIMIT}
      shared={shared}
      renderItem={(pair) => (
        <span key={pair.key} className="rel-cat-item rel-cat-pair">
          <NameButton name={pair.a} shared={shared} />
          <span className="rel-cat-mutual-mark" aria-hidden="true">
            ⇄
          </span>
          <NameButton name={pair.b} shared={shared} />
        </span>
      )}
    />
  );
}
