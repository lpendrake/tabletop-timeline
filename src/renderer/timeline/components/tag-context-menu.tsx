import { parseEntityTag, isValidCustomTag } from '../../../shared/entity-tags';
import { ContextMenu } from '../../shared/context-menu';
import type { ContextMenuItem } from '../../shared/context-menu';
import '../../shared/context-menu/context-menu.css';

interface Handlers {
  onEditTagLabel(entityId: string): void;
  onResetTagLabel(entityId: string): void;
  onGoTo(entityId: string): void;
  onCopyLink(entityId: string): void;
  onRemoveTag(filename: string, tag: string): void;
  onFilterByTag(tag: string): void;
}

interface Props extends Handlers {
  tag: string;
  filename: string;
  x: number;
  y: number;
  onClose(): void;
}

/**
 * Builds the item set for a tag chip's context menu. Entity tags (`id:xxxx`)
 * get label-override/go-to/copy-link actions; custom tags get a remove
 * action. "Filter By Tag" is always available, for any tag shape.
 */
export function buildTagContextMenuItems(
  tag: string,
  filename: string,
  handlers: Handlers,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const entityId = parseEntityTag(tag);

  if (entityId) {
    items.push({
      kind: 'submenu',
      label: 'Override tag label',
      items: [
        {
          kind: 'action',
          label: 'Globally',
          onSelect: () => handlers.onEditTagLabel(entityId),
        },
        {
          kind: 'action',
          label: 'Reset global override',
          onSelect: () => handlers.onResetTagLabel(entityId),
        },
      ],
    });
    items.push({ kind: 'action', label: 'Go to', onSelect: () => handlers.onGoTo(entityId) });
    items.push({
      kind: 'action',
      label: 'Copy Link',
      onSelect: () => handlers.onCopyLink(entityId),
    });
  }

  if (isValidCustomTag(tag)) {
    items.push({
      kind: 'action',
      label: 'Remove Tag',
      onSelect: () => handlers.onRemoveTag(filename, tag),
    });
  }

  if (items.length > 0) items.push({ kind: 'separator' });
  items.push({
    kind: 'action',
    label: 'Filter By Tag',
    onSelect: () => handlers.onFilterByTag(tag),
  });

  return items;
}

export function TagContextMenu({ tag, filename, x, y, onClose, ...handlers }: Props) {
  const items = buildTagContextMenuItems(tag, filename, handlers);
  return <ContextMenu items={items} x={x} y={y} onClose={onClose} />;
}
