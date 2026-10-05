import { useRef, type KeyboardEvent } from 'react';
import type { EntityIndexEntry } from '../../../types/global';
import type { InvalidDirectiveEntry } from '../../../shared/relationships/ipc-types';
import { nextTabIndex, tabMeta, type TrackTab } from '../domain/tabs';
import { ProblemsBadge } from './problems-badge';
import './top-bar.css';

interface TopBarProps {
  tabs: readonly TrackTab[];
  activeTrackId: string | null;
  onSelectTab: (trackId: string) => void;
  asOfLabel: string | null;
  problems: readonly InvalidDirectiveEntry[];
  entityIndex: readonly EntityIndexEntry[];
  onOpenById: (entityId: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function TopBar({
  tabs,
  activeTrackId,
  onSelectTab,
  asOfLabel,
  problems,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: TopBarProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(index, tabs.length, e.key);
    if (next === null) return;
    e.preventDefault();
    onSelectTab(tabs[next].trackId);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="rel-top-bar">
      <h2 className="rel-top-bar-title">Relationships</h2>
      <div className="rel-tabs" role="tablist" aria-label="Relationship tracks">
        {tabs.map((tab, i) => {
          const active = tab.trackId === activeTrackId;
          return (
            <button
              key={tab.trackId}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={active ? 'rel-tab rel-tab-active' : 'rel-tab'}
              onClick={() => onSelectTab(tab.trackId)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.name} <span className="rel-tab-meta">{tabMeta(tab)}</span>
            </button>
          );
        })}
      </div>
      <div className="rel-top-bar-right">
        {asOfLabel !== null && <span className="rel-as-of">as of {asOfLabel}</span>}
        <ProblemsBadge
          problems={problems}
          entityIndex={entityIndex}
          onOpenById={onOpenById}
          onOpenEvent={onOpenEvent}
        />
      </div>
    </div>
  );
}
