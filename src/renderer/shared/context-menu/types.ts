import type { Rect } from './submenu-position';
import type { CaretSide } from './caret-position';

export type ContextMenuVariant = 'default' | 'danger';

export type ContextMenuItem =
  | {
      kind: 'action';
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      variant?: ContextMenuVariant;
      /** Extra text searched alongside the label (see `menu-search.ts`). */
      keywords?: string[];
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

/** Why a context menu closed. */
export type ContextMenuCloseReason = 'select' | 'escape' | 'backspace' | 'outside';

/**
 * Anchors the menu to a text caret's line (e.g. a slash-command menu) rather
 * than a fixed point. Positioning is computed once, when the menu opens, via
 * `computeCaretPlacement` — see `caret-position.ts`.
 */
export interface CaretAnchor {
  lineRect: Rect;
  prefer: CaretSide;
}
