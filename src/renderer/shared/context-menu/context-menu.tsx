import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { useContextMenuBehavior } from './use-context-menu-behavior';
import { computeSubmenuPosition } from './submenu-position';
import type { SubmenuSide } from './submenu-position';
import type { ContextMenuItem, ContextMenuVariant } from './types';

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

/** The root, positioned panel. Mirrors the two hand-rolled menus it replaces. */
export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const { menuRef, pos } = useContextMenuBehavior(x, y, onClose);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ContextMenuItemList items={items} onCloseAll={onClose} preferLeft={false} />
    </div>
  );
}

function itemClassName(
  base: string,
  variant: ContextMenuVariant | undefined,
  disabled: boolean,
): string {
  let className = base;
  if (variant === 'danger') className += ' context-menu-item--danger';
  if (disabled) className += ' context-menu-item--disabled';
  return className;
}

/** Renders one level of items. Used recursively by submenu rows. */
function ContextMenuItemList({
  items,
  onCloseAll,
  preferLeft,
}: {
  items: ContextMenuItem[];
  onCloseAll: () => void;
  /**
   * Whether submenus at this level should prefer opening to the left. Set by
   * the ancestor submenu's resolved open side, so a chain of nested
   * submenus keeps opening the same direction once one of them has flipped
   * left near the right screen edge.
   */
  preferLeft: boolean;
}) {
  return (
    <Fragment>
      {items.map((item, index) => (
        <ContextMenuRow key={index} item={item} onCloseAll={onCloseAll} preferLeft={preferLeft} />
      ))}
    </Fragment>
  );
}

function ContextMenuRow({
  item,
  onCloseAll,
  preferLeft,
}: {
  item: ContextMenuItem;
  onCloseAll: () => void;
  preferLeft: boolean;
}) {
  switch (item.kind) {
    case 'separator':
      return <div className="context-menu-sep" role="separator" />;
    case 'header':
      return <div className="context-menu-header">{item.label}</div>;
    case 'action':
      return <ActionRow item={item} onCloseAll={onCloseAll} />;
    case 'submenu':
      return <SubmenuRow item={item} onCloseAll={onCloseAll} preferLeft={preferLeft} />;
  }
}

function ActionRow({
  item,
  onCloseAll,
}: {
  item: Extract<ContextMenuItem, { kind: 'action' }>;
  onCloseAll: () => void;
}) {
  const disabled = !!item.disabled;
  return (
    <button
      type="button"
      role="menuitem"
      className={itemClassName('context-menu-item', item.variant, disabled)}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) return;
        item.onSelect();
        onCloseAll();
      }}
    >
      {item.label}
    </button>
  );
}

function SubmenuRow({
  item,
  onCloseAll,
  preferLeft,
}: {
  item: Extract<ContextMenuItem, { kind: 'submenu' }>;
  onCloseAll: () => void;
  preferLeft: boolean;
}) {
  const disabled = !!item.disabled;
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: SubmenuSide } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rowEl = rowRef.current;
    const panelEl = panelRef.current;
    if (!rowEl || !panelEl) return;
    const rowRect = rowEl.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    setPos(
      computeSubmenuPosition(
        rowRect,
        { width: panelRect.width, height: panelRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        preferLeft,
      ),
    );
  }, [open, preferLeft]);

  return (
    <div
      className="context-menu-submenu-wrap"
      onMouseEnter={() => {
        if (!disabled) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        ref={rowRef}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled}
        className={itemClassName(
          'context-menu-item context-menu-item--submenu',
          item.variant,
          disabled,
        )}
      >
        <span>{item.label}</span>
        <span className="context-menu-chevron" aria-hidden="true">
          ▸
        </span>
      </div>
      {open && !disabled && (
        <div
          ref={panelRef}
          className="context-menu"
          role="menu"
          style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
        >
          <ContextMenuItemList
            items={item.items}
            onCloseAll={onCloseAll}
            preferLeft={pos?.side === 'left'}
          />
        </div>
      )}
    </div>
  );
}
