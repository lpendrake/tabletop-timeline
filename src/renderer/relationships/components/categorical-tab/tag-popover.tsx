import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { EntityIndexEntry } from '../../../../types/global';
import { computeCaretPlacement } from '../../../shared/context-menu/caret-position';
import { placementStyle } from '../../../shared/context-menu/placement-style';
import type { OptionChip } from '../../domain/categorical';
import type { TagHistory } from '../../domain/categorical-history';
import { openDeclaringFile } from '../../domain/step-open-target';
import { usePopoverDismiss } from '../../hooks/use-popover-dismiss';
import { EntityLink } from '../entity-link';
import { OptionChipView } from './option-chip';
import './tag-popover.css';

interface TagPopoverProps {
  anchor: HTMLElement;
  history: TagHistory;
  holderId: string;
  holderLabel: string;
  observerId: string;
  observerLabel: string;
  chip: OptionChip;
  mutual: boolean;
  onClose: () => void;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
  entityIndex: readonly EntityIndexEntry[];
}

/** One tag's gain/loss history for a holder–observer pair, placed under the clicked name. */
export function TagPopover({
  anchor,
  history,
  holderId,
  holderLabel,
  observerId,
  observerLabel,
  chip,
  mutual,
  onClose,
  onOpenById,
  onOpenEvent,
  entityIndex,
}: TagPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const headerId = useId();
  const [style, setStyle] = useState<CSSProperties | null>(null);
  usePopoverDismiss(true, onClose, popoverRef, anchorRef);

  useLayoutEffect(() => {
    function place() {
      const el = popoverRef.current;
      if (!el) return;
      // Measure the content's own height: the cap applied by a previous placement would hide it.
      const cap = el.style.maxHeight;
      el.style.maxHeight = '';
      const { width, height } = el.getBoundingClientRect();
      el.style.maxHeight = cap;
      const placement = computeCaretPlacement(
        anchor.getBoundingClientRect(),
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        'below',
      );
      setStyle(placementStyle(placement));
    }
    function onScroll(e: Event) {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      place();
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor]);

  return (
    <div
      ref={popoverRef}
      className="rel-tag-popover"
      role="dialog"
      aria-labelledby={headerId}
      style={style ?? { visibility: 'hidden' }}
    >
      <div id={headerId} className="rel-tag-popover-header">
        <span className="rel-tag-popover-title-parts">
          <EntityLink id={holderId} label={holderLabel} onOpenById={onOpenById} />
          <OptionChipView chip={chip} />
          <span className="rel-tag-popover-of">{mutual ? '⇄' : 'of'}</span>
          <EntityLink id={observerId} label={observerLabel} onOpenById={onOpenById} />
        </span>
        <button
          type="button"
          className="rel-tag-popover-close"
          aria-label="Close"
          onClick={() => {
            onClose();
            anchor.focus({ preventScroll: true });
          }}
        >
          ×
        </button>
      </div>
      <div className="rel-tag-popover-status">{history.statusText}</div>
      <ul className="rel-tag-popover-list">
        {history.entries.map((entry) => (
          <li key={entry.key} className="rel-tag-popover-entry">
            <span className="rel-tag-popover-date">{entry.dateLabel}</span>
            <span className={`rel-tag-popover-change rel-tag-popover-change--${entry.change}`}>
              {entry.change}
            </span>
            <button
              type="button"
              className="rel-tag-popover-title"
              onClick={() =>
                openDeclaringFile(entry.declaredPath, entityIndex, {
                  event: onOpenEvent,
                  note: onOpenById,
                })
              }
            >
              {entry.linkLabel}
            </button>
            {entry.reason !== null && (
              <span className="rel-tag-popover-reason">{entry.reason}</span>
            )}
            {entry.mirroredFrom !== null && (
              <span className="rel-tag-popover-mirrored">
                (mirrored from {entry.mirroredFrom}&apos;s side)
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
