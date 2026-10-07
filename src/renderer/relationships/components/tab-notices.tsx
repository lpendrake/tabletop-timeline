import type { InvalidDirectiveEntry } from '../../../shared/relationships';
import { emptyStateParts, tabBodyNotice } from '../domain/tabs';
import type { ViewGroup } from '../domain/view-rows';

function EmptyState({ trackName }: { trackName: string }) {
  const [before, slash, after] = emptyStateParts(trackName);
  return (
    <div className="rel-empty">
      {before}
      <code>{slash}</code>
      {after}
    </div>
  );
}

/** The empty-track hint or the no-match message when a tab body has no rows; nothing otherwise. */
export function TabNotice(props: {
  groups: readonly ViewGroup[];
  query: string;
  emptyMessage: string | null;
  trackName: string;
}) {
  const notice = tabBodyNotice(props.groups, props.query, props.emptyMessage);
  if (!notice) return null;
  if (notice.kind === 'empty-track') return <EmptyState trackName={props.trackName} />;
  return <div className="rel-empty">{notice.message}</div>;
}

/** Invalid directives declared on the active track. */
export function TrackProblems({ problems }: { problems: readonly InvalidDirectiveEntry[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="rel-problems rel-track-problems">
      <h4 className="rel-problems-title">Problems in this track</h4>
      <ul>
        {problems.map((p) => (
          <li key={`${p.path}#${p.ordinal ?? p.from}`}>
            {p.messages.join('; ')} <span className="rel-problem-file">{p.path}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
