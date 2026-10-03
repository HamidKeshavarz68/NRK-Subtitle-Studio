/**
 * Watch progress per programme (films and episodes): where the viewer stopped
 * and whether they finished it. Drives resume, the progress bars and "Watched"
 * badges on cards, and the status on the details page. Stored in localStorage.
 */

import { h } from "./dom";

export interface Progress {
  /** Seconds watched. */
  t: number;
  /** Duration in seconds, 0 when unknown. */
  d: number;
  done: boolean;
  /** When it was last updated (ms since epoch). */
  at: number;
}

const KEY = "nss.tv.progress";
/** Resume positions saved by older versions: { id: seconds }. */
const LEGACY_KEY = "nss.tv.positions";
const MAX_ENTRIES = 500;
/** Positions before this aren't worth resuming from (or recording). */
const MIN_START = 30;

let cache: Record<string, Progress> | null = null;

function load(): Record<string, Progress> {
  if (cache) return cache;
  const out: Record<string, Progress> = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, Partial<Progress>>;
    for (const id of Object.keys(raw)) {
      const p = raw[id];
      if (p && typeof p.t === "number" && typeof p.d === "number") {
        out[id] = { t: p.t, d: p.d, done: !!p.done, at: typeof p.at === "number" ? p.at : 0 };
      }
    }
  } catch {
    // Corrupt storage: start over.
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Record<string, number>;
      for (const id of Object.keys(old)) {
        if (!out[id] && typeof old[id] === "number") out[id] = { t: old[id], d: 0, done: false, at: 0 };
      }
      localStorage.removeItem(LEGACY_KEY);
      cache = out;
      save();
    }
  } catch {
    // ignore
  }
  cache = out;
  return out;
}

function save(): void {
  const all = load();
  const ids = Object.keys(all);
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => all[a].at - all[b].at);
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete all[id];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Finished = into the end credits: 95 % watched, or less than a minute left of a longer programme. */
export function isFinished(t: number, d: number): boolean {
  return d > 0 && (t >= d * 0.95 || (d >= 600 && d - t <= 60));
}

export function getProgress(id: string): Progress | null {
  return load()[id] || null;
}

/** Remember the position of `id` (called while playing and when leaving the player). */
export function recordProgress(id: string, t: number, duration: number): void {
  if (!(t > 0)) return;
  const all = load();
  const prev = all[id];
  const d = duration > 0 && isFinite(duration) ? duration : prev ? prev.d : 0;
  const done = isFinished(t, d);
  // Peeking at the first seconds of something shouldn't wipe what was saved before.
  if (!done && t < MIN_START) return;
  all[id] = { t: Math.floor(t), d: Math.floor(d), done, at: Date.now() };
  save();
}

export function markWatched(id: string, duration = 0): void {
  const prev = getProgress(id);
  const d = duration > 0 ? duration : prev ? prev.d : 0;
  load()[id] = { t: d, d, done: true, at: Date.now() };
  save();
}

export function clearProgress(id: string): void {
  delete load()[id];
  save();
}

/** Where to start playing `id`: the saved position, or 0 when new or finished. */
export function resumePoint(id: string): number {
  const p = getProgress(id);
  if (!p || p.done || p.t < MIN_START) return 0;
  if (p.d > 0 && p.t > p.d - 5) return 0;
  return p.t;
}

/** "23 min left", "Watched", or "" when not started. */
export function progressLabel(p: Progress | null): string {
  if (!p) return "";
  if (p.done) return "✓ Watched";
  if (p.d > 0) {
    const left = Math.max(1, Math.round((p.d - p.t) / 60));
    return `${left} min left`;
  }
  return "Started";
}

/** Draw the bar / badge for programme `id` on a card image (and keep it updatable). */
export function decorate(img: HTMLElement, id: string): void {
  img.setAttribute("data-pid", id);
  paintOne(img);
}

function paintOne(img: HTMLElement): void {
  const old = img.querySelectorAll(".pbar, .badge.seen");
  for (let i = 0; i < old.length; i++) img.removeChild(old[i]);
  const p = getProgress(img.getAttribute("data-pid") || "");
  if (!p) return;
  if (p.done) {
    img.appendChild(h("div", { class: "badge seen", text: "✓ Watched" }));
  } else if (p.t > 0) {
    const frac = p.d > 0 ? Math.max(0.03, Math.min(1, p.t / p.d)) : 0.05;
    const fill = h("div", { class: "pbar-fill" });
    fill.style.width = (frac * 100).toFixed(1) + "%";
    img.appendChild(h("div", { class: "pbar" }, fill));
  }
}

/** Refresh every decorated card under `root` (e.g. after returning from the player). */
export function paintProgress(root: ParentNode = document): void {
  const list = root.querySelectorAll("[data-pid]");
  for (let i = 0; i < list.length; i++) paintOne(list[i] as HTMLElement);
}
