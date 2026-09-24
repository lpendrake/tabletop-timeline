import type { EntityIndexEntry } from '../../types/global';
import { showPeek, type PeekHandle } from './show';
import { resolvePeekTarget } from './resolve';
import { buildEntityLabelMap } from '../../shared/entity-labels';
import { isContextMenuOpen, onContextMenuOpenChange } from '../shared/context-menu';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 250;
const MAX_DEPTH = 5;

interface StackEntry {
  handle: PeekHandle;
  sourceLink: HTMLElement;
}

let stack: StackEntry[] = [];
let pinned: PeekHandle[] = [];
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let stackConfig: PeekStackConfig | null = null;
let unsubDelta: (() => void) | null = null;
let unsubMenu: (() => void) | null = null;

export interface PeekStackConfig {
  fetcher: (path: string, signal: AbortSignal) => Promise<string>;
  getEntityIndex: () => readonly EntityIndexEntry[];
  onOpenById?: (id: string) => void;
}

function cancelOpen() {
  if (openTimer !== null) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

function cancelClose() {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function isLive(el: Element | null): boolean {
  // `relatedTarget` on a native mouse event isn't always an Element — the
  // pointer can leave into the Document (or another non-Element node, or
  // out of the window entirely, e.g. into devtools), and `.closest` would
  // throw on anything that isn't one.
  if (!(el instanceof Element)) return false;
  if (el.closest('.peek-window')) return true;

  // CM6 wiki-link decoration spans
  const cmLink = el.closest<HTMLElement>('.cm-note-link');
  if (cmLink) {
    const noteId = cmLink.dataset.noteId;
    return !!noteId && resolvePeekTarget(noteId, '', stackConfig?.getEntityIndex() ?? []) !== null;
  }

  // Plain <a href> links in rendered HTML (e.g. markdown preview surfaces with data-base-dir)
  const a = el.closest('a[href]') as HTMLAnchorElement | null;
  if (!a) return false;
  const baseDir = a.closest('[data-base-dir]')?.getAttribute('data-base-dir') ?? '';
  if (!baseDir) return false;
  return (
    resolvePeekTarget(
      a.getAttribute('href') ?? '',
      baseDir,
      stackConfig?.getEntityIndex() ?? [],
    ) !== null
  );
}

function closeStack() {
  for (const e of stack) e.handle.close();
  stack = [];
}

function openWindow(path: string, anchor: HTMLElement, depth: number) {
  if (depth < stack.length && stack[depth].handle.path === path) {
    while (stack.length > depth + 1) stack.pop()!.handle.close();
    return;
  }

  while (stack.length > depth) stack.pop()!.handle.close();

  const entityLabels = buildEntityLabelMap(stackConfig!.getEntityIndex());

  const handle = showPeek({
    targetEl: anchor,
    linkInfo: { path },
    fetcher: stackConfig!.fetcher,
    onOpenById: stackConfig!.onOpenById,
    entityLabels,
    stackDepth: Math.min(depth, MAX_DEPTH - 1),
    onPin: () => {
      stack = stack.filter((e) => e.handle !== handle);
      pinned.push(handle);
    },
    onClose: () => {
      stack = stack.filter((e) => e.handle !== handle);
      pinned = pinned.filter((p) => p !== handle);
    },
  });

  stack.push({ handle, sourceLink: anchor });
}

function computeDepth(anchor: HTMLElement): number {
  const windowEl = anchor.closest('.peek-window') as HTMLElement | null;
  if (!windowEl) return 0;
  const idx = stack.findIndex((e) => e.handle.el === windowEl);
  return idx >= 0 ? idx + 1 : 0;
}

function scheduleOpen(path: string, anchor: HTMLElement) {
  const depth = computeDepth(anchor);
  openTimer = setTimeout(() => {
    openTimer = null;
    openWindow(path, anchor, depth);
  }, OPEN_DELAY_MS);
}

function startCloseTimer() {
  if (stack.length > 0 && closeTimer === null) {
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeStack();
    }, CLOSE_DELAY_MS);
  }
}

function scheduleClose() {
  // A context menu opened from inside a peek (or anywhere else) must not
  // let a hover-out close the peek stack out from under it — the menu's
  // actions (e.g. "Go to", "Copy link") need the peek's context to still be
  // there. `recheckAfterMenuCloses` re-evaluates once the menu goes away.
  if (isContextMenuOpen()) return;
  startCloseTimer();
}

/**
 * The element the pointer is currently over, without a global `mousemove`
 * tracker: Chromium (and so Electron's renderer) keeps `:hover` accurate on
 * every element the pointer is over, most-specific last, so the last match
 * is the same element `elementFromPoint` at the pointer would return.
 */
function hoveredElement(): Element | null {
  const hovered = document.querySelectorAll(':hover');
  return hovered.length > 0 ? hovered[hovered.length - 1] : null;
}

/**
 * Re-applies the normal hover-out rule right after a context menu closes:
 * if the pointer isn't over a live element any more, schedule the usual
 * close. Without this, a peek whose hover-out was suppressed while the menu
 * was open (see `scheduleClose`) would stay open indefinitely until the next
 * unrelated mouse movement happened to cross a element boundary.
 *
 * Calls `startCloseTimer` directly rather than `scheduleClose` — the
 * subscription that calls this already knows (from the registry, not a DOM
 * query) that the last menu just closed, and a closing `<ContextMenu>`'s
 * `.context-menu` node can still be attached for a tick after its unmount
 * effect cleanup (this function's caller) runs; `scheduleClose`'s
 * `isContextMenuOpen` guard would see that lingering node and wrongly skip.
 */
function recheckAfterMenuCloses() {
  if (stack.length === 0) return;
  if (isLive(hoveredElement())) return;
  startCloseTimer();
}

function handleOver(e: MouseEvent) {
  if (!(e.target instanceof Element)) return;
  const target = e.target;
  if (target.closest('.peek-window')) cancelClose();

  // CM6 wiki-link span
  const cmLink = target.closest<HTMLElement>('.cm-note-link');
  if (cmLink) {
    const noteId = cmLink.dataset.noteId;
    if (!noteId) return;
    const peekTarget = resolvePeekTarget(noteId, '', stackConfig?.getEntityIndex() ?? []);
    if (!peekTarget) return;
    cancelClose();
    cancelOpen();
    scheduleOpen(peekTarget.path, cmLink);
    return;
  }

  // Plain <a href> links in rendered HTML surfaces that carry data-base-dir
  const a = target.closest('a[href]') as HTMLAnchorElement | null;
  if (!a) return;
  const baseDir = a.closest('[data-base-dir]')?.getAttribute('data-base-dir') ?? '';
  if (!baseDir) return;
  const peekTarget = resolvePeekTarget(
    a.getAttribute('href') ?? '',
    baseDir,
    stackConfig?.getEntityIndex() ?? [],
  );
  if (!peekTarget) return;
  cancelClose();
  cancelOpen();
  scheduleOpen(peekTarget.path, a);
}

function handleOut(e: MouseEvent) {
  if (isLive(e.relatedTarget as Element | null)) return;
  cancelOpen();
  scheduleClose();
}

function handleKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopImmediatePropagation();
  stack.pop()!.handle.close();
}

export function initPeek(config: PeekStackConfig): void {
  if (stackConfig !== null) teardownPeek();
  stackConfig = config;
  document.addEventListener('mouseover', handleOver);
  document.addEventListener('mouseout', handleOut);
  window.addEventListener('keydown', handleKey);
  // Notified on every open/close transition (0→1 or 1→0 open menus); we
  // only act on the close side, re-applying the hover-out rule that was
  // suppressed while a menu was open.
  unsubMenu = onContextMenuOpenChange((open) => {
    if (!open) recheckAfterMenuCloses();
  });
  unsubDelta = window.fsApi.onEntityDelta(() => {
    if (!stackConfig) return;
    const labels = buildEntityLabelMap(stackConfig.getEntityIndex());
    for (const e of stack) e.handle.updateLabels(labels);
    for (const p of pinned) p.updateLabels(labels);
  });
}

export function teardownPeek(): void {
  document.removeEventListener('mouseover', handleOver);
  document.removeEventListener('mouseout', handleOut);
  window.removeEventListener('keydown', handleKey);
  unsubMenu?.();
  unsubMenu = null;
  cancelOpen();
  cancelClose();
  closeStack();
  pinned.forEach((p) => p.close());
  pinned = [];
  unsubDelta?.();
  unsubDelta = null;
  stackConfig = null;
}

export function openFromWikiLink(id: string, el: HTMLElement): void {
  if (!stackConfig) return;
  const peekTarget = resolvePeekTarget(id, '', stackConfig.getEntityIndex());
  if (!peekTarget) return;
  cancelClose();
  cancelOpen();
  scheduleOpen(peekTarget.path, el);
}

export function closeFromWikiLink(relatedTarget: Element | null): void {
  if (!stackConfig) return;
  if (isLive(relatedTarget)) return;
  cancelOpen();
  scheduleClose();
}
