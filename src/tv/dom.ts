/** Tiny DOM helpers. API text is only ever assigned via textContent. */

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const name in attrs) {
      const v = attrs[name];
      if (v === undefined || v === null || v === false) continue;
      if (name === "class") el.className = String(v);
      else if (name === "text") el.textContent = String(v);
      else el.setAttribute(name, v === true ? "" : String(v));
    }
  }
  appendAll(el, children);
  return el;
}

function appendAll(el: Node, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) appendAll(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function qsa(root: ParentNode, sel: string): HTMLElement[] {
  return Array.prototype.slice.call(root.querySelectorAll(sel)) as HTMLElement[];
}

/** Background image that loads lazily once the element is near the viewport. */
let observer: IntersectionObserver | null = null;

export function lazyBg(el: HTMLElement, url: string | undefined): void {
  if (!url) return;
  el.setAttribute("data-bg", url);
  if (typeof IntersectionObserver === "undefined") {
    el.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          const bg = target.getAttribute("data-bg");
          if (bg) target.style.backgroundImage = `url("${bg.replace(/"/g, "%22")}")`;
          observer!.unobserve(target);
        }
      },
      { rootMargin: "400px" }
    );
  }
  observer.observe(el);
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const hr = Math.floor(sec / 3600);
  const two = (n: number) => (n < 10 ? "0" + n : String(n));
  return (hr ? hr + ":" + two(m) : String(m)) + ":" + two(s);
}

export function spinner(text = "Loading…"): HTMLElement {
  return h("div", { class: "status" }, h("div", { class: "spinner" }), h("span", { text }));
}

export function errorBox(err: unknown): HTMLElement {
  const msg = err instanceof Error ? err.message : String(err);
  return h("div", { class: "status error" }, h("span", { text: msg }));
}
