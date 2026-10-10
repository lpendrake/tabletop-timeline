import { nameListId, type CategoricalCard } from '../../domain/categorical';
import { dropIndicatorClass } from '../../domain/row-display';
import type { MoveRow } from '../../domain/view-order';
import { useRowReorder } from '../../hooks/use-row-drag';
import { HighlightText } from '../highlight-text';
import { DragHandle, dropTargetProps, openRowMoveMenu } from '../row-controls';
import { NameList, PairList, type NameListShared } from './name-list';
import { OptionChipView } from './option-chip';

export interface CategoricalCardViewProps {
  card: CategoricalCard;
  isFirst: boolean;
  isLast: boolean;
  /** The list the cards reorder in; null when they cannot be reordered. */
  listKey: string | null;
  moveRow: MoveRow;
  shared: NameListShared;
}

/** One card, by tag or by entity; both groupings share this design. */
export function CategoricalCardView({
  card,
  isFirst,
  isLast,
  listKey,
  moveRow,
  shared,
}: CategoricalCardViewProps) {
  const drag = useRowReorder(listKey ?? '', card.id, moveRow);
  const byTag = card.kind === 'tag';
  return (
    <section
      className={`rel-cat-card${dropIndicatorClass(drag.indicator)}`}
      {...dropTargetProps(drag, listKey !== null)}
      onContextMenu={
        listKey !== null
          ? (e) => openRowMoveMenu(e, moveRow, listKey, card.id, isFirst, isLast)
          : undefined
      }
    >
      <div className="rel-cat-card-header">
        {byTag ? (
          <>
            {card.chip && <OptionChipView chip={card.chip} />}
            {card.mutual && <span className="rel-cat-muted">mutual</span>}
          </>
        ) : (
          <>
            {listKey !== null && <DragHandle drag={drag} />}
            <span className="rel-cat-entity">
              <HighlightText text={card.title} query={shared.query} />
            </span>
          </>
        )}
        <span className="rel-cat-count">{card.count}</span>
      </div>
      {card.pairs && (
        <div className="rel-cat-row">
          <PairList
            listId={nameListId(card.kind, card.id, null)}
            pairs={card.pairs}
            shared={shared}
          />
        </div>
      )}
      {card.rows.map((row) => {
        const chip = row.chip ?? card.chip;
        if (!chip) return null;
        return (
          <div key={row.id} className="rel-cat-row">
            <div className="rel-cat-row-label">
              {byTag ? (
                <span className="rel-cat-observer">
                  <HighlightText text={row.label} query={shared.query} />
                </span>
              ) : (
                <OptionChipView chip={chip} />
              )}
              <span className="rel-cat-count">{row.count}</span>
            </div>
            <NameList
              listId={nameListId(card.kind, card.id, row.id)}
              names={row.names}
              mutual={row.mutual}
              shared={shared}
            />
          </div>
        );
      })}
    </section>
  );
}
