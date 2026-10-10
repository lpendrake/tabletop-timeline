import type { ReactNode } from 'react';
import type { RelationshipsViewState } from '../hooks/use-relationships';
import { HolderPicker } from './holder-picker';
import { SearchBox } from './search-box';
import { SortControl } from './sort-control';
import './toolbar.css';

export type ToolbarProps = Pick<
  RelationshipsViewState,
  | 'holderPicker'
  | 'selectHolder'
  | 'labelFor'
  | 'scopes'
  | 'toggleScope'
  | 'query'
  | 'setQuery'
  | 'countLabel'
  | 'sortModes'
  | 'sortMode'
  | 'setSortMode'
> & {
  /** Extra controls rendered after the sort control. */
  children?: ReactNode;
};

/** Holder picker, search and sort on one row, then any extra controls. */
export function Toolbar(props: ToolbarProps) {
  return (
    <div className="rel-toolbar">
      <HolderPicker
        picker={props.holderPicker}
        labelFor={props.labelFor}
        onSelect={props.selectHolder}
      />
      <SearchBox
        query={props.query}
        onQueryChange={props.setQuery}
        countLabel={props.countLabel}
        scopes={props.scopes}
        onToggleScope={props.toggleScope}
      />
      <SortControl modes={props.sortModes} active={props.sortMode} onChange={props.setSortMode} />
      {props.children}
    </div>
  );
}
