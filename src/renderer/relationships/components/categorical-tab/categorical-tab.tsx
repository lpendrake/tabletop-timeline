import { Fragment, useState, type ReactNode } from 'react';
import type { EntityIndexEntry } from '../../../../types/global';
import type { InvalidDirectiveEntry, TagTrack } from '../../../../shared/relationships';
import {
  highlightQueries,
  sectionFoldKey,
  toggledId,
  type CategoricalTable,
  type TableRow,
  type TableSection,
} from '../../domain/categorical';
import type { SearchScope } from '../../domain/search';
import { bodyNotice } from '../../domain/tabs';
import { EntityLink } from '../entity-link';
import { NoticeView, TrackProblems } from '../tab-notices';
import { OptionChipView } from './option-chip';
import { TagHistory } from './tag-history';
import './categorical-tab.css';

export interface CategoricalTabProps {
  /** The tab's toolbar, shown above the table. */
  toolbar: ReactNode;
  track: TagTrack;
  view: CategoricalTable;
  query: string;
  /** The search scopes and whether each is on; only enabled scopes highlight their cells. */
  scopes: ReadonlyArray<{ scope: SearchScope; enabled: boolean }>;
  emptyMessage: string | null;
  trackProblems: InvalidDirectiveEntry[];
  now: number;
  titleByPath: ReadonlyMap<string, string>;
  labelFor: (id: string) => string;
  entityIndex: EntityIndexEntry[] | null;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

const COLUMNS = ['', 'Holder', 'Tag', '', 'Observer', 'Reason'];

/** The toolbar's usage hint. */
export function CategoricalHint() {
  return (
    <span className="rel-cat-hint">Click a section to fold it · click a row for its history</span>
  );
}

function SectionRow(props: { section: TableSection; folded: boolean; onToggle: () => void }) {
  const { section, folded } = props;
  return (
    <button
      type="button"
      className="rel-cat-section"
      aria-expanded={!folded}
      onClick={props.onToggle}
    >
      <span className="rel-cat-chevron" aria-hidden="true">
        {folded ? '▸' : '▾'}
      </span>
      {section.chip ? (
        <>
          <OptionChipView chip={section.chip} />
          {section.mutual && <span className="rel-cat-mutual">mutual</span>}
        </>
      ) : (
        <span className="rel-cat-holder">{section.title}</span>
      )}
      <span className="rel-cat-count">{section.rows.length}</span>
    </button>
  );
}

function ResultRow(props: {
  row: TableRow;
  open: boolean;
  highlight: ReturnType<typeof highlightQueries>;
  onToggle: () => void;
  onOpenById: (id: string) => void;
}) {
  const { row, open, highlight, onOpenById } = props;
  return (
    // Clicking anywhere toggles; the links inside stop their own clicks, and the chevron is the keyboard control.
    <div className="rel-cat-row" onClick={props.onToggle}>
      <button
        type="button"
        className="rel-cat-chevron"
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} history: ${row.holderLabel}, ${row.chip.label}, ${row.observerLabel}`}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      <span className="rel-cat-holder">
        <EntityLink
          id={row.holderId}
          label={row.holderLabel}
          onOpenById={onOpenById}
          query={highlight.holder}
        />
      </span>
      <span className="rel-cat-tag">
        <OptionChipView chip={row.chip} query={highlight.tag} />
      </span>
      <span className="rel-cat-verb">{row.mutual ? '⇄' : '→'}</span>
      <span className="rel-cat-observer">
        <EntityLink
          id={row.observerId}
          label={row.observerLabel}
          onOpenById={onOpenById}
          query={highlight.observer}
        />
      </span>
      <span className="rel-cat-reason">{row.reason}</span>
    </div>
  );
}

export function CategoricalTab(props: CategoricalTabProps) {
  const { track, view, query } = props;
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // The open row closes when the grouping or query changes (adjusting state while rendering, not in an effect).
  const tableKey = `${view.groupBy}|${query}`;
  const [openIn, setOpenIn] = useState(tableKey);
  const [open, setOpen] = useState<string | null>(null);
  if (openIn !== tableKey) {
    setOpenIn(tableKey);
    setOpen(null);
  }
  const highlight = highlightQueries(query, props.scopes);
  return (
    <div className="rel-cat-tab">
      {props.toolbar}
      <NoticeView
        notice={bodyNotice(view.sections.length > 0, query, props.emptyMessage)}
        trackName={track.name}
      />
      {view.sections.length > 0 && (
        <div className="rel-cat-table">
          <div className="rel-cat-columns" aria-hidden="true">
            {COLUMNS.map((title, i) => (
              <span key={i}>{title}</span>
            ))}
          </div>
          {view.sections.map((section) => {
            const foldKey = sectionFoldKey(section);
            const isFolded = folded.has(foldKey);
            return (
              <Fragment key={foldKey}>
                <SectionRow
                  section={section}
                  folded={isFolded}
                  onToggle={() => setFolded(toggledId(folded, foldKey))}
                />
                {!isFolded &&
                  section.rows.map((row) => (
                    <Fragment key={row.key}>
                      <ResultRow
                        row={row}
                        open={open === row.key}
                        highlight={highlight}
                        onOpenById={props.onOpenById}
                        onToggle={() => setOpen(open === row.key ? null : row.key)}
                      />
                      {open === row.key && (
                        <TagHistory
                          row={row}
                          track={track}
                          now={props.now}
                          titleByPath={props.titleByPath}
                          labelFor={props.labelFor}
                          entityIndex={props.entityIndex}
                          onOpenEvent={props.onOpenEvent}
                          onOpenById={props.onOpenById}
                        />
                      )}
                    </Fragment>
                  ))}
              </Fragment>
            );
          })}
        </div>
      )}
      <TrackProblems problems={props.trackProblems} />
    </div>
  );
}
