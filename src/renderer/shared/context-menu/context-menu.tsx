import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useContextMenuBehavior } from './use-context-menu-behavior';
import { computeSubmenuPosition } from './submenu-position';
import type { SubmenuSide } from './submenu-position';
import { computeCaretPlacement } from './caret-position';
import { itemAtPath, isPathPrefix, pathsEqual } from './menu-navigation';
import { filterMenu, type FilteredNode, type MenuTarget } from './menu-search';
import {
  initialMenuKeyStateFor,
  menuHover,
  menuKeyDown,
  menuQueryChange,
  menuSearchHover,
  type MenuKeyState,
} from './menu-keyboard';
import type {
  CaretAnchor,
  ContextMenuCloseReason,
  ContextMenuItem,
  ContextMenuVariant,
} from './types';

export interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: (reason?: ContextMenuCloseReason) => void;
  /** Called instead of refocusing the pre-open `document.activeElement` on close. */
  restoreFocus?: () => void;
  /** When true, Backspace with no search open closes the menu (reason 'backspace'). */
  backspaceCloses?: boolean;
  /** Anchors the panel to a text caret's line instead of the fixed x/y point. */
  anchor?: CaretAnchor;
}

type ActionItem = Extract<ContextMenuItem, { kind: 'action' }>;

/** The root, positioned panel. Mirrors the two hand-rolled menus it replaces. */
export function ContextMenu({
  items,
  x,
  y,
  onClose,
  restoreFocus,
  backspaceCloses,
  anchor,
}: ContextMenuProps) {
  const [state, setState] = useState<MenuKeyState>(() => initialMenuKeyStateFor(items));
  const { highlightPath, isSearching, query, targetIndex } = state;
  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef<HTMLInputElement>(null);

  const keyboardOpenPath = useMemo(
    () => (highlightPath ? highlightPath.slice(0, -1) : []),
    [highlightPath],
  );

  const filtered = useMemo(
    () =>
      isSearching
        ? filterMenu(items, query)
        : { visible: [] as FilteredNode[], targets: [] as MenuTarget[] },
    [items, query, isSearching],
  );

  useEffect(() => {
    if (isSearching) inputRef.current?.focus({ preventScroll: true });
  }, [isSearching]);

  const selectAction = useCallback(
    (item: ActionItem) => {
      restoreFocusNowRef.current();
      item.onSelect();
      onClose('select');
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const result = menuKeyDown(
        stateRef.current,
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey },
        items,
        { backspaceCloses },
      );
      setState(result.state);
      if (result.effect) {
        if (result.effect.type === 'select') {
          const item = itemAtPath(items, result.effect.path);
          if (item && item.kind === 'action') selectAction(item);
        } else {
          restoreFocusNowRef.current();
          onClose('backspace');
        }
      }
      return result.handled;
    },
    [items, backspaceCloses, onClose, selectAction],
  );

  const { menuRef, pos, restoreFocusNow } = useContextMenuBehavior(x, y, onClose, {
    restoreFocus,
    onKeyDown: handleKeyDown,
  });
  const restoreFocusNowRef = useRef(restoreFocusNow);
  restoreFocusNowRef.current = restoreFocusNow;

  // When search exits (Escape, or backspacing the query to empty) the search
  // <input> unmounts. Without this, focus would fall to `<body>`, and a
  // window-capture listener registered before this menu's own (e.g. the
  // timeline's keyboard shortcuts) could see focus outside any
  // `.context-menu` and act on the next keystroke instead of the menu
  // starting a new search. Move focus back to the panel itself so it never
  // falls to body while the menu is open.
  const wasSearchingRef = useRef(isSearching);
  useEffect(() => {
    if (wasSearchingRef.current && !isSearching) {
      menuRef.current?.focus({ preventScroll: true });
    }
    wasSearchingRef.current = isSearching;
  }, [isSearching, menuRef]);

  const [anchorStyle, setAnchorStyle] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const anchorMeasuredRef = useRef(false);

  useLayoutEffect(() => {
    if (!anchor || anchorMeasuredRef.current) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    anchorMeasuredRef.current = true;
    const placement = computeCaretPlacement(
      anchor.lineRect,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      anchor.prefer,
    );
    setAnchorStyle({
      left: placement.left,
      top: placement.top,
      bottom: placement.bottom,
      maxHeight: placement.maxHeight,
    });
    // Re-runs whenever `anchor` changes until measured (guarded by
    // anchorMeasuredRef) and is a no-op forever after, so the side never
    // flips once chosen — even if the panel's height grows while searching.
  }, [anchor, menuRef]);

  const style: React.CSSProperties = anchor
    ? anchorStyle
      ? {
          left: anchorStyle.left,
          top: anchorStyle.top,
          bottom: anchorStyle.bottom,
          maxHeight: anchorStyle.maxHeight,
          overflowY: 'auto',
        }
      : { visibility: 'hidden' }
    : { left: pos.x, top: pos.y };

  function handleHover(path: number[]) {
    setState((s) => menuHover(s, path));
  }

  function handleSearchHover(path: number[]) {
    setState((s) => menuSearchHover(s, path, items));
  }

  function handleQueryChange(value: string) {
    setState((s) => menuQueryChange(s, value, items));
  }

  const currentTargetPath = targetIndex >= 0 ? (filtered.targets[targetIndex]?.path ?? null) : null;
  const currentTargetLabels =
    targetIndex >= 0 ? (filtered.targets[targetIndex]?.labels ?? null) : null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      tabIndex={-1}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isSearching && (
        <div className="context-menu-search-row">
          <input
            ref={inputRef}
            type="text"
            className="context-menu-search-input"
            aria-label="Search menu"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <span
            className={
              filtered.targets.length === 0
                ? 'context-menu-search-echo context-menu-search-echo--empty'
                : 'context-menu-search-echo'
            }
          >
            {filtered.targets.length === 0
              ? 'No matches'
              : (currentTargetLabels?.join(' › ') ?? '')}
          </span>
        </div>
      )}
      {isSearching ? (
        <FilteredList
          nodes={filtered.visible}
          currentTargetPath={currentTargetPath}
          depth={0}
          onActivate={selectAction}
          onHover={handleSearchHover}
        />
      ) : (
        <ContextMenuItemList
          items={items}
          path={[]}
          onSelectAction={selectAction}
          preferLeft={false}
          highlightPath={highlightPath}
          keyboardOpenPath={keyboardOpenPath}
          onHover={handleHover}
        />
      )}
    </div>
  );
}

function itemClassName(
  base: string,
  variant: ContextMenuVariant | undefined,
  disabled: boolean,
  highlighted: boolean,
): string {
  let className = base;
  if (variant === 'danger') className += ' context-menu-item--danger';
  if (disabled) className += ' context-menu-item--disabled';
  if (highlighted) className += ' context-menu-item--highlighted';
  return className;
}

/** Renders one level of items. Used recursively by submenu rows. */
function ContextMenuItemList({
  items,
  path,
  onSelectAction,
  preferLeft,
  highlightPath,
  keyboardOpenPath,
  onHover,
}: {
  items: ContextMenuItem[];
  path: number[];
  onSelectAction: (item: ActionItem) => void;
  preferLeft: boolean;
  highlightPath: number[] | null;
  keyboardOpenPath: number[];
  onHover: (path: number[]) => void;
}) {
  return (
    <Fragment>
      {items.map((item, index) => (
        <ContextMenuRow
          key={index}
          item={item}
          path={[...path, index]}
          onSelectAction={onSelectAction}
          preferLeft={preferLeft}
          highlightPath={highlightPath}
          keyboardOpenPath={keyboardOpenPath}
          onHover={onHover}
        />
      ))}
    </Fragment>
  );
}

function ContextMenuRow({
  item,
  path,
  onSelectAction,
  preferLeft,
  highlightPath,
  keyboardOpenPath,
  onHover,
}: {
  item: ContextMenuItem;
  path: number[];
  onSelectAction: (item: ActionItem) => void;
  preferLeft: boolean;
  highlightPath: number[] | null;
  keyboardOpenPath: number[];
  onHover: (path: number[]) => void;
}) {
  switch (item.kind) {
    case 'separator':
      return <div className="context-menu-sep" role="separator" />;
    case 'header':
      return <div className="context-menu-header">{item.label}</div>;
    case 'action':
      return (
        <ActionRow
          item={item}
          path={path}
          onSelectAction={onSelectAction}
          highlighted={pathsEqual(path, highlightPath)}
          onHover={onHover}
        />
      );
    case 'submenu':
      return (
        <SubmenuRow
          item={item}
          path={path}
          onSelectAction={onSelectAction}
          preferLeft={preferLeft}
          highlightPath={highlightPath}
          keyboardOpenPath={keyboardOpenPath}
          onHover={onHover}
          highlighted={pathsEqual(path, highlightPath)}
        />
      );
  }
}

function ActionRow({
  item,
  path,
  onSelectAction,
  highlighted,
  onHover,
}: {
  item: ActionItem;
  path: number[];
  onSelectAction: (item: ActionItem) => void;
  highlighted: boolean;
  onHover: (path: number[]) => void;
}) {
  const disabled = !!item.disabled;
  return (
    <button
      type="button"
      role="menuitem"
      className={itemClassName('context-menu-item', item.variant, disabled, highlighted)}
      disabled={disabled}
      aria-disabled={disabled}
      onMouseEnter={() => {
        if (!disabled) onHover(path);
      }}
      onClick={() => {
        if (disabled) return;
        onSelectAction(item);
      }}
    >
      {item.label}
    </button>
  );
}

function SubmenuRow({
  item,
  path,
  onSelectAction,
  preferLeft,
  highlightPath,
  keyboardOpenPath,
  onHover,
  highlighted,
}: {
  item: Extract<ContextMenuItem, { kind: 'submenu' }>;
  path: number[];
  onSelectAction: (item: ActionItem) => void;
  preferLeft: boolean;
  highlightPath: number[] | null;
  keyboardOpenPath: number[];
  onHover: (path: number[]) => void;
  highlighted: boolean;
}) {
  const disabled = !!item.disabled;
  const [hoverOpen, setHoverOpen] = useState(false);
  const keyboardOpen = isPathPrefix(path, keyboardOpenPath);
  const open = (hoverOpen || keyboardOpen) && !disabled;
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
        if (!disabled) {
          setHoverOpen(true);
          onHover(path);
        }
      }}
      onMouseLeave={() => setHoverOpen(false)}
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
          highlighted,
        )}
      >
        <span>{item.label}</span>
        <span className="context-menu-chevron" aria-hidden="true">
          ▸
        </span>
      </div>
      {open && (
        <div
          ref={panelRef}
          className="context-menu"
          role="menu"
          style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
        >
          <ContextMenuItemList
            items={item.items}
            path={path}
            onSelectAction={onSelectAction}
            preferLeft={pos?.side === 'left'}
            highlightPath={highlightPath}
            keyboardOpenPath={keyboardOpenPath}
            onHover={onHover}
          />
        </div>
      )}
    </div>
  );
}

function searchLeafClassName(
  variant: ContextMenuVariant | undefined,
  highlighted: boolean,
): string {
  let className = 'context-menu-item';
  if (variant === 'danger') className += ' context-menu-item--danger';
  if (highlighted) className += ' context-menu-item--highlighted';
  return className;
}

/** Renders the filtered (search-mode) tree: matching leaves, and matched submenus expanded inline. */
function FilteredList({
  nodes,
  currentTargetPath,
  depth,
  onActivate,
  onHover,
}: {
  nodes: FilteredNode[];
  currentTargetPath: number[] | null;
  depth: number;
  onActivate: (item: ActionItem) => void;
  onHover: (path: number[]) => void;
}) {
  return (
    <Fragment>
      {nodes.map((node, index) => {
        if (node.kind === 'action') {
          const highlighted = pathsEqual(node.path, currentTargetPath);
          return (
            <button
              key={index}
              type="button"
              role="menuitem"
              className={searchLeafClassName(node.item.variant, highlighted)}
              style={{ paddingLeft: 14 + depth * 14 }}
              onMouseEnter={() => onHover(node.path)}
              onClick={() => onActivate(node.item)}
            >
              {node.item.label}
            </button>
          );
        }
        return (
          <div key={index} className="context-menu-search-group">
            <div
              className="context-menu-search-group-label"
              style={{ paddingLeft: 14 + depth * 14 }}
            >
              {node.item.label}
            </div>
            <FilteredList
              nodes={node.children}
              currentTargetPath={currentTargetPath}
              depth={depth + 1}
              onActivate={onActivate}
              onHover={onHover}
            />
          </div>
        );
      })}
    </Fragment>
  );
}
