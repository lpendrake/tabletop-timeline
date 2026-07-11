import type { ExtendUnit } from '../calendar/add-in-game-duration';
import { formatExpanded } from '../calendar/format';
import { CalendarProvider } from '../calendar/provider';
import { ContextMenu } from '../../shared/context-menu';
import type { ContextMenuItem } from '../../shared/context-menu';
import '../../shared/context-menu/context-menu.css';

export type CanvasContextMenuTarget =
  | { kind: 'session'; sessionId: string; x: number; y: number }
  | { kind: 'rail'; contextSeconds: number; x: number; y: number }
  | { kind: 'background'; contextSeconds: number; x: number; y: number };

interface Props {
  target: CanvasContextMenuTarget;
  onClose(): void;
  onEditSession(sessionId: string): void;
  onExtendSession(sessionId: string, unit: ExtendUnit): void;
  onDeleteSession(sessionId: string): void;
  onCreateSessionAtPoint(contextSeconds: number): void;
  onCreateEvent(contextSeconds: number): void;
  onCreateSessionFromLast(contextSeconds: number): void;
  onSetNow(contextSeconds: number): void;
}

const EXTEND_OPTIONS: { label: string; unit: ExtendUnit }[] = [
  { label: '1 hour', unit: 'hour' },
  { label: 'Half a day', unit: 'half-day' },
  { label: '1 day', unit: 'day' },
  { label: '1 week', unit: 'week' },
  { label: '1 month', unit: 'month' },
];

function contextTimeLabel(contextSeconds: number): string {
  const cal = CalendarProvider.get();
  return formatExpanded(cal.fromEpochSeconds(contextSeconds));
}

function buildItems(
  target: CanvasContextMenuTarget,
  handlers: Omit<Props, 'target' | 'onClose'>,
): ContextMenuItem[] {
  switch (target.kind) {
    case 'session':
      return [
        { kind: 'action', label: 'Edit', onSelect: () => handlers.onEditSession(target.sessionId) },
        {
          kind: 'submenu',
          label: 'Extend by',
          items: EXTEND_OPTIONS.map(({ label, unit }) => ({
            kind: 'action',
            label,
            onSelect: () => handlers.onExtendSession(target.sessionId, unit),
          })),
        },
        {
          kind: 'action',
          label: 'Delete',
          onSelect: () => handlers.onDeleteSession(target.sessionId),
          variant: 'danger',
        },
      ];
    case 'rail':
      return [
        { kind: 'header', label: contextTimeLabel(target.contextSeconds) },
        {
          kind: 'action',
          label: 'Create session',
          onSelect: () => handlers.onCreateSessionAtPoint(target.contextSeconds),
        },
      ];
    case 'background':
      return [
        { kind: 'header', label: contextTimeLabel(target.contextSeconds) },
        {
          kind: 'action',
          label: 'Create event',
          onSelect: () => handlers.onCreateEvent(target.contextSeconds),
        },
        {
          kind: 'action',
          label: 'Create session',
          onSelect: () => handlers.onCreateSessionFromLast(target.contextSeconds),
        },
        {
          kind: 'action',
          label: 'Set now',
          onSelect: () => handlers.onSetNow(target.contextSeconds),
        },
      ];
  }
}

export function TimelineCanvasContextMenu({ target, onClose, ...handlers }: Props) {
  const items = buildItems(target, handlers);
  return <ContextMenu items={items} x={target.x} y={target.y} onClose={onClose} />;
}
