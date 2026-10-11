import type { ReactNode } from 'react';
import type { InvalidDirectiveEntry, TagTrack } from '../../../../shared/relationships';
import type { CategoricalTable } from '../../domain/categorical';
import { bodyNotice } from '../../domain/tabs';
import { NoticeView, TrackProblems } from '../tab-notices';
import { OptionChipView } from './option-chip';
import './categorical-tab.css';

export interface CategoricalTabProps {
  /** The tab's toolbar, shown above the table. */
  toolbar: ReactNode;
  track: TagTrack;
  view: CategoricalTable;
  query: string;
  emptyMessage: string | null;
  trackProblems: InvalidDirectiveEntry[];
}

/** Temporary body for the Relationship tags tab: a plain list of the table's rows until the table UI lands. */
export function CategoricalTab(props: CategoricalTabProps) {
  const { track, view, query } = props;
  return (
    <div className="rel-cat-tab">
      {props.toolbar}
      <NoticeView
        notice={bodyNotice(view.sections.length > 0, query, props.emptyMessage)}
        trackName={track.name}
      />
      {view.sections.map((section) => (
        <section key={`${section.kind}:${section.id}`}>
          <h3>
            {section.chip ? <OptionChipView chip={section.chip} /> : section.title}{' '}
            {section.rows.length}
          </h3>
          <ul>
            {section.rows.map((row) => (
              <li key={row.key}>
                {row.holderLabel} <OptionChipView chip={row.chip} /> {row.mutual ? '⇄' : '→'}{' '}
                {row.observerLabel} {row.reason}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <TrackProblems problems={props.trackProblems} />
    </div>
  );
}
