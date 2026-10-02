/**
 * Spatial (D-pad) navigation. Every element with the `focusable` class inside
 * the current scope can receive focus; arrow keys move to the geometrically
 * nearest candidate in that direction. Elements inside a container marked
 * `data-remember` restore the last item focused in that container.
 */

import { qsa } from "./dom";

export type Dir = "left" | "right" | "up" | "down";

let current: HTMLElement | null = null;
const listeners: ((el: HTMLElement) => void)[] = [];

export function focused(): HTMLElement | null {
  return current && document.body.contains(current) ? current : null;
}

export function onFocusChange(fn: (el: HTMLElement) => void): void {
  listeners.push(fn);
}

export function focus(el: HTMLElement | null | undefined): void {
  if (!el) return;
  if (current && current !== el) current.classList.remove("focused");
  current = el;
  el.classList.add("focused");
  const group = closest(el, "[data-remember]");
  if (group) (group as HTMLElement & { _last?: HTMLElement })._last = el;
  if (document.activeElement && document.activeElement !== el && document.activeElement !== document.body) {
    (document.activeElement as HTMLElement).blur();
  }
  revealInScrollers(el);
  for (const fn of listeners) fn(el);
}

function closest(el: Element, sel: string): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (matches(cur, sel)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function matches(el: Element, sel: string): boolean {
  const fn =
    el.matches ||
    (el as unknown as { webkitMatchesSelector: (s: string) => boolean }).webkitMatchesSelector;
  return fn.call(el, sel);
}

function visible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** First focusable element in `scope`, preferring one marked `data-autofocus`. */
export function focusFirst(scope: ParentNode): boolean {
  const all = qsa(scope, ".focusable").filter(visible);
  const pick = all.filter((e) => e.hasAttribute("data-autofocus"))[0] || all[0];
  if (pick) focus(pick);
  return !!pick;
}

/** Move focus in a direction within `scope`. Returns false when nothing lies that way. */
export function move(dir: Dir, scope: ParentNode): boolean {
  const from = focused();
  if (!from) return focusFirst(scope);
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of qsa(scope, ".focusable")) {
    if (el === from || !visible(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    let primary: number;
    let secondary: number;
    switch (dir) {
      case "left":
        if (b.right > a.left + 1 && bx >= ax) continue;
        primary = a.left - b.right;
        secondary = overlap(a.top, a.bottom, b.top, b.bottom) ? 0 : Math.abs(by - ay);
        break;
      case "right":
        if (b.left < a.right - 1 && bx <= ax) continue;
        primary = b.left - a.right;
        secondary = overlap(a.top, a.bottom, b.top, b.bottom) ? 0 : Math.abs(by - ay);
        break;
      case "up":
        if (b.bottom > a.top + 1 && by >= ay) continue;
        primary = a.top - b.bottom;
        secondary = overlap(a.left, a.right, b.left, b.right) ? Math.abs(bx - ax) / 4 : Math.abs(bx - ax);
        break;
      default:
        if (b.top < a.bottom - 1 && by <= ay) continue;
        primary = b.top - a.bottom;
        secondary = overlap(a.left, a.right, b.left, b.right) ? Math.abs(bx - ax) / 4 : Math.abs(bx - ax);
        break;
    }
    const score = Math.max(primary, 0) + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) return false;

  // Entering a remembered group from outside restores the previous item.
  const group = closest(best, "[data-remember]") as (HTMLElement & { _last?: HTMLElement }) | null;
  if (group && !group.contains(from) && group._last && group.contains(group._last) && visible(group._last)) {
    best = group._last;
  }
  focus(best);
  return true;
}

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/** Scroll `.scroll-x` / `.scroll-y` ancestors so `el` is fully visible (no smooth-scroll API needed). */
function revealInScrollers(el: HTMLElement): void {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const isX = node.classList.contains("scroll-x");
    const isY = node.classList.contains("scroll-y");
    if (isX || isY) {
      const box = node.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const pad = 60;
      if (isX) {
        if (r.left < box.left + pad) node.scrollLeft -= box.left + pad - r.left;
        else if (r.right > box.right - pad) node.scrollLeft += r.right - (box.right - pad);
      }
      if (isY) {
        if (r.top < box.top + pad) node.scrollTop -= box.top + pad - r.top;
        else if (r.bottom > box.bottom - pad) node.scrollTop += r.bottom - (box.bottom - pad);
      }
    }
    node = node.parentElement;
  }
}
