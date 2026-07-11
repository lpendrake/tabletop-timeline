import type { EventListItem } from '../data/types';
import { ContextMenu } from '../../shared/context-menu';
import type { ContextMenuItem } from '../../shared/context-menu';
import '../../shared/context-menu/context-menu.css';

interface Props {
  item: EventListItem;
  x: number;
  y: number;
  onClose(): void;
  onEdit(filename: string): void;
  onDelete(item: EventListItem): void;
  onEditTagLabel(entityId: string): void;
  onEditLinkLabel(entityId: string): void;
  onOpenInExplorer(item: EventListItem): void;
  onCopyLink(item: EventListItem): void;
}

export function EventContextMenu({
  item,
  x,
  y,
  onClose,
  onEdit,
  onDelete,
  onEditTagLabel,
  onEditLinkLabel,
  onOpenInExplorer,
  onCopyLink,
}: Props) {
  const items: ContextMenuItem[] = [
    { kind: 'action', label: 'Edit', onSelect: () => onEdit(item.filename) },
    {
      kind: 'action',
      label: 'Delete',
      onSelect: () => onDelete(item),
      variant: 'danger',
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Edit Tag Label',
      onSelect: () => {
        if (item.id) onEditTagLabel(item.id);
      },
    },
    {
      kind: 'action',
      label: 'Edit Link Label',
      onSelect: () => {
        if (item.id) onEditLinkLabel(item.id);
      },
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Open in file explorer',
      onSelect: () => onOpenInExplorer(item),
    },
    { kind: 'action', label: 'Copy Link', onSelect: () => onCopyLink(item) },
  ];

  return <ContextMenu items={items} x={x} y={y} onClose={onClose} />;
}
