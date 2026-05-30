/**
 * Hiding NRK's own on-video captions while the overlay is expanded.
 *
 * Two renderers are involved:
 *  - the native `track.mode` renderer (flipped 'showing' → 'hidden'), and
 *  - NRK's bespoke DOM nodes, which we match by visible text and
 *    `visibility:hidden` for the active cue.
 * Both are restored when the overlay collapses.
 */

import { OVERLAY_ID } from "./config";
import { state, ui } from "./state";
import { cueText, isSubtitleTrack, normalizeWhitespace } from "./utils";

/** Marker for a native track whose mode we overrode (so we can restore it). */
export const NATIVE_OVERRIDDEN = "__nsrOverridden";

const hiddenDomEls = new Set<HTMLElement>();

/**
 * Walk up to the largest ancestor still ~the size of the video (not the whole
 * page) — typically the player root.
 */
function findPlayerContainer(video: HTMLVideoElement): HTMLElement {
  let el: HTMLElement | null = video.parentElement;
  let best: HTMLElement | null = el;
  const vw = video.clientWidth || 1;
  while (el && el !== document.body && el !== document.documentElement) {
    const r = el.getBoundingClientRect();
    if (r.width > vw * 4) break; // grown well beyond the video's footprint
    best = el;
    el = el.parentElement;
  }
  return best || video.parentElement || document.body;
}

export function restoreHiddenNativeDom(): void {
  hiddenDomEls.forEach((el) => {
    el.style.visibility = "";
  });
  hiddenDomEls.clear();
}

/** Hide NRK's DOM-rendered subtitle that matches the active cue at time `t`. */
export function hideNativeDomSubtitles(cue: VTTCue | null, t: number): void {
  // Always start by restoring whatever we hid last frame.
  restoreHiddenNativeDom();

  if (!ui.isExpanded || !state.video || !cue) return;

  // The native renderer only draws while the cue overlaps the current time.
  if (t < cue.startTime || t > cue.endTime) return;

  const raw = cueText(cue);
  const lines = raw.split(/\n+/).map(normalizeWhitespace).filter((l) => l.length >= 2);
  if (!lines.length) return;
  const joined = normalizeWhitespace(raw.replace(/\n+/g, " "));

  const root = findPlayerContainer(state.video);

  // Walk descendants; only hide leaf-ish text nodes, never our overlay or
  // interactive controls.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as HTMLElement;
      if (el.closest(`#${OVERLAY_ID}`)) return NodeFilter.FILTER_REJECT;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    // Likely a subtitle line, not an entire panel.
    if (el.childElementCount > 4) continue;
    const txt = normalizeWhitespace(el.textContent || "");
    if (!txt || txt.length > joined.length + 80) continue;

    const matches =
      txt === joined ||
      lines.some((l) => txt === l) ||
      // Some renderers wrap each line in its own element AND have a wrapper
      // containing both lines glued together with a space.
      (lines.length > 1 && txt === lines.join(" "));

    if (matches) {
      if (el.style.visibility !== "hidden") {
        el.style.visibility = "hidden";
      }
      hiddenDomEls.add(el);
    }
  }
}

/**
 * Apply the expand/collapse policy to native track rendering:
 *  - Expanded:  flip any 'showing' subtitle track to 'hidden' (and remember it).
 *  - Collapsed: restore any track we previously hid, plus our hidden DOM nodes.
 */
export function applyNativeSubtitleVisibility(): void {
  if (!state.video) return;
  const tracks = state.video.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!isSubtitleTrack(t)) continue;
    if (ui.isExpanded) {
      if (t.mode === "showing") {
        (t as any)[NATIVE_OVERRIDDEN] = true;
        try { t.mode = "hidden"; } catch { /* ignore */ }
      }
    } else if ((t as any)[NATIVE_OVERRIDDEN]) {
      try { t.mode = "showing"; } catch { /* ignore */ }
      delete (t as any)[NATIVE_OVERRIDDEN];
    }
  }
  if (!ui.isExpanded) restoreHiddenNativeDom();
}
