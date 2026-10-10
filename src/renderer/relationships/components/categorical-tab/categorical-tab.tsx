import { useMemo, useState, type ReactNode } from 'react';
import type { InvalidDirectiveEntry, TagTrack } from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';
import {
  findShownName,
  isSearching,
  nameTag,
  toggledId,
  type CategoricalView,
} from '../../domain/categorical';
import { tagHistory } from '../../domain/categorical-history';
import { bodyNotice } from '../../domain/tabs';
import type { MoveRow } from '../../domain/view-order';
import { NoticeView, TrackProblems } from '../tab-notices';
import { CategoricalCardView } from './categorical-card';
import type { NameClick, NameListShared } from './name-list';
import { TagPopover } from './tag-popover';
import './categorical-tab.css';

export interface CategoricalTabProps {
  /** The tab's toolbar, shown above the cards. */
  toolbar: ReactNode;
  track: TagTrack;
  view: CategoricalView;
  query: string;
  labelFor: (id: string) => string;
  emptyMessage: string | null;
  trackProblems: InvalidDirectiveEntry[];
  now: number;
  titleByPath: ReadonlyMap<string, string>;
  entityIndex: EntityIndexEntry[] | null;
  moveRow: MoveRow;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

/** The Relationship tags tab: cards grouped by tag or by entity, and the history popover of the clicked name. */
export function CategoricalTab(props: CategoricalTabProps) {
  const { track, view, query, labelFor } = props;
  // Which name lists are shown in full, and which name's history is open; neither is persisted.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<NameClick | null>(null);
  // The popover belongs to one grouping and query: adjust state during render when either changes.
  const [prevGroupBy, setPrevGroupBy] = useState(view.groupBy);
  const [prevQuery, setPrevQuery] = useState(query);
  const name =
    open && findShownName(view, open.entryKey, { expanded, searching: isSearching(query) });
  if (prevGroupBy !== view.groupBy || prevQuery !== query || (open && !name)) {
    setPrevGroupBy(view.groupBy);
    setPrevQuery(query);
    setOpen(null);
  }

  const history = useMemo(
    () =>
      name
        ? tagHistory(name.ledger, track, name.option, props.now, props.titleByPath, labelFor)
        : null,
    [name, track, props.now, props.titleByPath, labelFor],
  );

  const shared: NameListShared = {
    query,
    expanded,
    toggleExpanded: (listId) => setExpanded((ids) => toggledId(ids, listId)),
    openEntryKey: name ? name.entryKey : null,
    onNameClick: (click) => setOpen((current) => (current?.anchor === click.anchor ? null : click)),
  };

  return (
    <div className="rel-cat-tab">
      {props.toolbar}
      <NoticeView
        notice={bodyNotice(view.cards.length > 0, query, props.emptyMessage)}
        trackName={track.name}
      />
      <div className="rel-cat-grid">
        {view.cards.map((card, i) => (
          <CategoricalCardView
            key={`${card.kind}:${card.id}`}
            card={card}
            isFirst={i === 0}
            isLast={i === view.cards.length - 1}
            listKey={view.listKey}
            moveRow={props.moveRow}
            shared={shared}
          />
        ))}
      </div>
      <TrackProblems problems={props.trackProblems} />
      {open && name && history && (
        <TagPopover
          anchor={open.anchor}
          history={history}
          holderId={name.holderId}
          holderLabel={name.label}
          observerId={name.observerId}
          observerLabel={labelFor(name.observerId)}
          {...nameTag(track, name)}
          onClose={() => setOpen(null)}
          onOpenById={props.onOpenById}
          onOpenEvent={props.onOpenEvent}
          entityIndex={props.entityIndex ?? []}
        />
      )}
    </div>
  );
}
