import { ContextMenu } from '../../shared/context-menu';
import type { ContextMenuItem } from '../../shared/context-menu';
import '../../shared/context-menu/context-menu.css';

export type ContextMenuTarget =
  | {
      kind: 'file';
      folder: string;
      path: string;
      id?: string;
      fileKind?: 'note' | 'asset' | 'unsupported';
      x: number;
      y: number;
    }
  | { kind: 'dir'; folder: string; path: string; x: number; y: number }
  | { kind: 'topfolder'; folder: string; x: number; y: number };

interface Props {
  target: ContextMenuTarget;
  onClose(): void;
  onNewFile(folder: string, subdir?: string): void;
  onNewFolder(folder: string, subdir?: string): void;
  onRename(folder: string, path: string): void;
  onDelete(folder: string, path: string | undefined, kind: ContextMenuTarget['kind']): void;
  onEditTagLabel?(folder: string, path: string): void;
  onEditLinkLabel?(folder: string, path: string): void;
  onOpenInExplorer(folder: string, path: string): void;
  onCopyLink(target: ContextMenuTarget): void;
}

export function NoteContextMenu({
  target,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onEditTagLabel,
  onEditLinkLabel,
  onOpenInExplorer,
  onCopyLink,
}: Props) {
  const path = target.kind !== 'topfolder' ? target.path : undefined;
  const parentDir = target.kind === 'dir' ? target.path : undefined;

  const items: ContextMenuItem[] = [];

  if (target.kind !== 'file') {
    items.push(
      { kind: 'action', label: 'New Note', onSelect: () => onNewFile(target.folder, parentDir) },
      {
        kind: 'action',
        label: 'New Folder',
        onSelect: () => onNewFolder(target.folder, parentDir),
      },
      { kind: 'separator' },
    );
  }

  items.push({
    kind: 'action',
    label: 'Rename',
    onSelect: () => onRename(target.folder, path ?? ''),
  });

  items.push({
    kind: 'action',
    label: target.kind === 'topfolder' ? 'Delete Folder' : 'Delete',
    onSelect: () => onDelete(target.folder, path, target.kind),
    variant: 'danger',
  });

  if (target.kind === 'file') {
    items.push(
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Edit Tag Label',
        onSelect: () => onEditTagLabel?.(target.folder, target.path),
      },
      {
        kind: 'action',
        label: 'Edit Link Label',
        onSelect: () => onEditLinkLabel?.(target.folder, target.path),
      },
      {
        kind: 'action',
        label: 'Open in file explorer',
        onSelect: () => onOpenInExplorer(target.folder, target.path),
      },
      {
        kind: 'action',
        label: 'Copy Link',
        onSelect: () => onCopyLink(target),
      },
    );
  }

  return <ContextMenu items={items} x={target.x} y={target.y} onClose={onClose} />;
}
