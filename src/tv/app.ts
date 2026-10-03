/** Screen stack, global key routing and small shared UI (toasts, cards). */

import { h, lazyBg } from "./dom";
import { focus, focusFirst, focused, move } from "./focus";
import { exitApp, IME_CANCEL, IME_DONE, toKey, type Key } from "./keys";
import type { Card } from "./nrk";
import { decorate, paintProgress } from "./progress";

export interface Screen {
  el: HTMLElement;
  /** Return true if the key was handled. Arrow keys fall back to spatial navigation. */
  onKey?(key: Key, e: KeyboardEvent): boolean;
  /** Key released (used to tell a short OK press from a held one). */
  onKeyUp?(key: Key, e: KeyboardEvent): void;
  /** Called when the screen becomes visible again after the screen above it was popped. */
  onResume?(): void;
  destroy?(): void;
  /** Last focused element, restored on resume. */
  lastFocus?: HTMLElement | null;
}

type Activatable = HTMLElement & { _activate?: () => void };

/** Run `fn` when the element is focused and OK/Enter is pressed (or it is clicked). */
export function onActivate(el: HTMLElement, fn: () => void): HTMLElement {
  (el as Activatable)._activate = fn;
  el.addEventListener("click", () => {
    focus(el);
    fn();
  });
  return el;
}

const stack: Screen[] = [];
let root: HTMLElement;
let toastEl: HTMLElement;
let toastTimer = 0;
let backArmedAt = 0;
let keyUpSeen = false;

/** True once the platform has delivered a keyup event (so press-and-hold can be detected). */
export function keyUpWorks(): boolean {
  return keyUpSeen;
}

export function top(): Screen | undefined {
  return stack[stack.length - 1];
}

export function push(screen: Screen): void {
  const prev = top();
  if (prev) {
    prev.lastFocus = focused();
    prev.el.style.display = "none";
  }
  stack.push(screen);
  root.appendChild(screen.el);
  focusFirst(screen.el);
}

export function pop(): void {
  if (stack.length <= 1) return;
  const s = stack.pop()!;
  if (s.destroy) s.destroy();
  if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
  const prev = top()!;
  prev.el.style.display = "";
  if (prev.lastFocus && prev.el.contains(prev.lastFocus)) focus(prev.lastFocus);
  else focusFirst(prev.el);
  if (prev.onResume) prev.onResume();
  paintProgress(prev.el);
}

export function toast(text: string, ms = 2200): void {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms);
}

/** Poster card used on the home, search, live and series screens. */
export function cardEl(card: Card, onOpen: (c: Card) => void, wide = true): HTMLElement {
  const img = h("div", { class: "card-img" });
  lazyBg(img, card.image);
  if (card.kind === "program") decorate(img, card.id);
  const el = h(
    "div",
    { class: "card focusable" + (wide ? "" : " card-small") },
    img,
    h(
      "div",
      { class: "card-text" },
      h("div", { class: "card-title", text: card.title }),
      card.meta ? h("div", { class: "card-meta", text: card.meta }) : null,
      card.subtitle ? h("div", { class: "card-sub", text: card.subtitle }) : null
    ),
    card.kind === "channel" ? h("div", { class: "badge live", text: "LIVE" }) : null
  );
  return onActivate(el, () => onOpen(card));
}

function handleInputKey(input: HTMLInputElement, e: KeyboardEvent): boolean {
  const code = e.keyCode;
  if (code === 13 || code === IME_DONE) {
    e.preventDefault();
    input.blur();
    input.dispatchEvent(new CustomEvent("submit-search"));
    return true;
  }
  if (code === IME_CANCEL || code === 10009 || code === 27) {
    e.preventDefault();
    input.blur();
    return true;
  }
  if (code === 38 || code === 40) {
    input.blur();
    return false; // continue to spatial navigation
  }
  return true; // let the input handle typing / caret keys
}

function onKeyDown(e: KeyboardEvent): void {
  const active = document.activeElement;
  if (active && active.tagName === "INPUT") {
    if (handleInputKey(active as HTMLInputElement, e)) return;
  }

  const key = toKey(e);
  if (!key) return;
  e.preventDefault();

  const screen = top();
  if (!screen) return;
  if (screen.onKey && screen.onKey(key, e)) return;

  switch (key) {
    case "left":
    case "right":
    case "up":
    case "down":
      move(key, screen.el);
      return;
    case "enter": {
      const el = focused() as Activatable | null;
      if (!el) return;
      if (el.tagName === "INPUT") (el as HTMLElement).focus();
      else if (el._activate) el._activate();
      return;
    }
    case "back":
      if (stack.length > 1) {
        pop();
      } else if (Date.now() - backArmedAt < 2500) {
        exitApp();
      } else {
        backArmedAt = Date.now();
        toast("Press Back again to exit");
      }
      return;
  }
}

export function startApp(container: HTMLElement, first: Screen): void {
  root = container;
  toastEl = h("div", { class: "toast" });
  document.body.appendChild(toastEl);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", (e) => {
    keyUpSeen = true;
    const key = toKey(e);
    const screen = top();
    if (key && screen && screen.onKeyUp) screen.onKeyUp(key, e);
  });
  push(first);
}
