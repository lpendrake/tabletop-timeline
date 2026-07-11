export type ContextMenuVariant = 'default' | 'danger';

export type ContextMenuItem =
  | {
      kind: 'action';
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      variant?: ContextMenuVariant;
    }
  | {
      kind: 'submenu';
      label: string;
      items: ContextMenuItem[];
      disabled?: boolean;
      variant?: ContextMenuVariant;
    }
  | { kind: 'separator' }
  | { kind: 'header'; label: string };
