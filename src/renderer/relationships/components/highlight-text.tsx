import { Fragment } from 'react';
import { highlightRanges } from '../domain/search';

export interface HighlightTextProps {
  text: string;
  query: string;
}

/** Text with the query's matches wrapped in `<mark class="rel-match">`. */
export function HighlightText({ text, query }: HighlightTextProps) {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], i) => {
    if (from > at) parts.push(<Fragment key={`t${i}`}>{text.slice(at, from)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className="rel-match">
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (at < text.length) parts.push(<Fragment key="tail">{text.slice(at)}</Fragment>);
  return <>{parts}</>;
}
