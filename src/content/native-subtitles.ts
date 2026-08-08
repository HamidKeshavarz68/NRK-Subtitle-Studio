/**
 * Hiding NRK's own on-video captions while the overlay is expanded.
 *
 * IMPORTANT: we must NOT flip the subtitle `track.mode` to hide it. NRK's player
 * (Shaka) only *streams* subtitle segments while its text track is visible, so
 * forcing the track to 'hidden' makes cue loading stop dead — the overlay then
 * freezes on the last-loaded cue while the video plays on. Instead we leave the
 * user-selected track exactly as it is and suppress the *visual* output, all
 * fully reversible:
 *  - a CSS rule that hides both the browser's `::cue` renderer and Shaka's DOM
 *    caption container (`.shaka-text-container`) up-front, so a freshly painted
 *    caption never flashes before it is hidden, and
 *  - as a fallback for any non-standard renderer, matching NRK's DOM caption
 *    nodes by text and `visibility:hidden`.
 */

import { OVERLAY_ID, FONT } from "./config";
import { state, settings } from "./state";
import { cueText, normalizeWhitespace } from "./utils";

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

/**
 * Tree walker over a player container that yields likely caption elements,
 * skipping our own overlay/settings and interactive controls. Shared by the
 * rolling-mode hide and single-mode text-override logic.
 */
function captionWalker(root: HTMLElement): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as HTMLElement;
      if (el.closest(`#${OVERLAY_ID}`) || el.closest(".nsr-settings-host")) return NodeFilter.FILTER_REJECT;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
}

/** Hide NRK's DOM-rendered subtitle that matches the active cue at time `t`. */
export function hideNativeDomSubtitles(cue: VTTCue | null, t: number): void {
  // Always start by restoring whatever we hid last frame.
  restoreHiddenNativeDom();

  if (settings.viewMode !== "rolling" || !state.video || !cue) return;

  // The native renderer only draws while the cue overlaps the current time.
  if (t < cue.startTime || t > cue.endTime) return;

  const raw = cueText(cue);
  const lines = raw.split(/\n+/).map(normalizeWhitespace).filter((l) => l.length >= 2);
  if (!lines.length) return;
  const joined = normalizeWhitespace(raw.replace(/\n+/g, " "));

  const root = findPlayerContainer(state.video);

  // Walk descendants; only hide leaf-ish text nodes, never our overlay or
  // interactive controls.
  const walker = captionWalker(root);

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
 * Apply the current view mode to native caption rendering. We never change
 * `track.mode` (that would stop the player streaming cues). In "rolling" mode
 * the overlay owns subtitle display, so we add a `::cue` hide style; in "single"
 * mode NRK's own captions are used, so we remove it and un-hide any DOM nodes.
 */
const CUE_HIDE_STYLE_ID = "nsr-native-cue-hide";

// NRK's player is Shaka, whose DOM text displayer renders captions into a
// `.shaka-text-container` node (not via `::cue`). Hiding that node reactively
// (by matching cue text after each render) leaves a one-frame flash as each new
// caption paints before our JS catches it. Hiding the container up-front with
// CSS removes the flash entirely, and — because it's only `visibility/opacity`,
// never `track.mode` — Shaka keeps streaming subtitle segments as normal.
const NATIVE_CAPTION_SELECTORS = [
  "video::cue",
  ".shaka-text-container",
  ".shaka-text-container *",
];

/** Toggle the up-front CSS rule that hides NRK's native captions. */
export function setNativeCueHidden(hidden: boolean): void {
  const existing = document.getElementById(CUE_HIDE_STYLE_ID);
  if (hidden) {
    if (existing) return;
    const style = document.createElement("style");
    style.id = CUE_HIDE_STYLE_ID;
    // Hide the browser's native cue renderer AND Shaka's DOM caption container
    // for every video on the page. The overlay only mounts on video pages, so
    // this is scoped in practice and fully removed when native captions are
    // wanted again.
    style.textContent =
      NATIVE_CAPTION_SELECTORS.join(",") +
      "{opacity:0!important;visibility:hidden!important;}";
    (document.head || document.documentElement).appendChild(style);
  } else if (existing) {
    existing.remove();
  }
}

export function applyNativeSubtitleVisibility(): void {
  if (!state.video) return;
  if (settings.viewMode === "rolling") {
    // Rolling mode: the overlay owns display, so hide NRK's captions and drop
    // any in-place text override left over from single mode.
    clearNativeCaptionOverride();
    setNativeCueHidden(true);
  } else {
    // Single mode: NRK's own caption is shown. The renderer rewrites its text
    // in place for Translated / Bilingual; nothing is hidden here.
    setNativeCueHidden(false);
    restoreHiddenNativeDom();
  }
}

/** Remove all native-caption suppression (used when tearing the overlay down). */
export function clearNativeSubtitleHiding(): void {
  clearNativeCaptionOverride();
  setNativeCueHidden(false);
  restoreHiddenNativeDom();
}

/* ------------------------------------------------------------------ *
 * Single mode: show a styled translated / bilingual caption in place of
 * NRK's own, WITHOUT touching NRK's caption text nodes.
 *
 * NRK renders each cue (lit-based `tv-player-subtitles`) into a
 * `.tv-player-subtitle-text` span in the light DOM. Rewriting that span's
 * content breaks lit's text binding — after a seek lit can no longer update
 * the caption and it freezes. So instead we:
 *   - add a class to the `tv-player-subtitles` host that visually hides NRK's
 *     own caption text (CSS `visibility:hidden`, fully reversible), and
 *   - append our own absolutely-positioned overlay element into the host and
 *     render the styled lines there.
 * NRK keeps managing its own (now-hidden) caption normally, so nothing ever
 * freezes; the renderer drives our overlay's content from the video's current
 * time. A MutationObserver re-asserts the class / overlay if NRK re-renders the
 * subtree.
 * ------------------------------------------------------------------ */

const SUBTITLE_HOST_SELECTOR = "tv-player-subtitles";
const SUPPRESS_CLASS = "nsr-cap-suppress";
const OVERLAY_CLASS = "nsr-cap-overlay";
const ROOT_REL_CLASS = "nsr-cap-root-rel";
const LIFT_CLASS = "nsr-cap-lift";

let captionObserver: MutationObserver | null = null;
let overrideEl: HTMLDivElement | null = null;
let rootEl: HTMLElement | null = null;
let overrideActive = false;
let lastHtml: string | null = null;
let liftTimer: number | null = null;

let singleRefreshCb: (() => void) | null = null;
let refreshScheduled = false;

/** Renderer registers its single-mode recompute here (avoids an import cycle). */
export function setSingleRefreshHandler(cb: () => void): void {
  singleRefreshCb = cb;
}

function scheduleSingleRefresh(): void {
  if (refreshScheduled || !singleRefreshCb) return;
  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    singleRefreshCb?.();
  });
}

function subtitleHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SUBTITLE_HOST_SELECTOR);
}

/**
 * The containing block NRK itself uses to position its caption: the closest
 * positioned ancestor of the video. This element is sized to the video (the
 * player's aspect-ratio box), so an absolutely-positioned overlay in it lines
 * up with the bottom of the picture — unlike the page-level container that
 * `findPlayerContainer` returns (which can be the full-height <main>).
 */
function captionAnchor(): { el: HTMLElement; wasStatic: boolean } | null {
  const video = state.video;
  if (!video) return null;
  let el: HTMLElement | null = video.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    if (getComputedStyle(el).position !== "static") return { el, wasStatic: false };
    el = el.parentElement;
  }
  // No positioned ancestor found — fall back to the player container and make
  // it a positioning context ourselves.
  const fallback = findPlayerContainer(video);
  return { el: fallback, wasStatic: true };
}

/**
 * Ensure NRK's native caption is suppressed (class on the subtitles host) and
 * our overlay is mounted in the video-sized player box, positioned over the
 * bottom of the picture.
 */
function ensureOverrideMounted(): boolean {
  const host = subtitleHost();
  if (host && !host.classList.contains(SUPPRESS_CLASS)) host.classList.add(SUPPRESS_CLASS);

  const anchor = captionAnchor();
  if (!anchor) return false;
  const root = anchor.el;
  if (anchor.wasStatic && !root.classList.contains(ROOT_REL_CLASS)) root.classList.add(ROOT_REL_CLASS);
  rootEl = root;

  if (!overrideEl) {
    overrideEl = document.createElement("div");
    overrideEl.className = OVERLAY_CLASS;
  }
  if (overrideEl.parentElement !== root) root.appendChild(overrideEl);
  return true;
}

function ensureCaptionObserver(): void {
  if (captionObserver) return;
  const host = subtitleHost();
  if (!host) return;
  captionObserver = new MutationObserver(() => {
    if (!overrideActive) return;
    // NRK may re-render the subtitle subtree (new cue, resize, etc.), which can
    // drop our suppression class or overlay. Re-assert them, then let the
    // renderer refresh our overlay's content for the current cue.
    const host2 = subtitleHost();
    const needsClass = !!host2 && !host2.classList.contains(SUPPRESS_CLASS);
    const needsOverlay = !overrideEl || !overrideEl.parentElement;
    if (needsClass || needsOverlay) {
      ensureOverrideMounted();
      scheduleSingleRefresh();
    }
  });
  captionObserver.observe(host, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
}

function stopCaptionObserver(): void {
  captionObserver?.disconnect();
  captionObserver = null;
}

/**
 * Whether NRK's player controls (scrubber / control bar) are currently visible.
 * NRK fades the controls in/out; we use this to lift our caption just enough to
 * clear the control bar only while it's showing.
 */
function controlsVisible(): boolean {
  const bar =
    document.querySelector<HTMLElement>("tv-player-scrubber") ||
    document.querySelector<HTMLElement>("tv-player-controls");
  if (!bar) return false;
  const anyEl = bar as unknown as {
    checkVisibility?: (opts?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;
  };
  if (typeof anyEl.checkVisibility === "function") {
    return anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const r = bar.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Toggle the "lift" class so the caption clears the control bar when shown. */
function updateLift(): void {
  if (!overrideEl) return;
  overrideEl.classList.toggle(LIFT_CLASS, controlsVisible());
}

function startLiftPolling(): void {
  if (liftTimer !== null) return;
  liftTimer = window.setInterval(updateLift, 200);
}

function stopLiftPolling(): void {
  if (liftTimer !== null) {
    clearInterval(liftTimer);
    liftTimer = null;
  }
}
function syncOverlayFontSize(): void {
  if (!overrideEl) return;
  const span = subtitleHost()?.querySelector<HTMLElement>(".tv-player-subtitle-text");
  const nativePx = span ? parseFloat(getComputedStyle(span).fontSize) : NaN;
  const scale = settings.fontSize / FONT.default;
  if (Number.isFinite(nativePx) && nativePx > 0) {
    overrideEl.style.fontSize = `${nativePx * scale}px`;
  } else {
    // Fallback if NRK's caption isn't measurable yet: scale a sensible base.
    overrideEl.style.fontSize = `${18 * scale}px`;
  }
}

/**
 * Show `html` as the on-video caption in place of NRK's own, for single mode.
 * `html` is the styled markup (a translated line, or original + translated
 * lines for bilingual). NRK's own caption text is hidden via CSS, never edited.
 */
export function setNativeCaptionOverride(html: string): void {
  overrideActive = true;
  if (!ensureOverrideMounted()) return;
  if (html !== lastHtml) {
    overrideEl!.innerHTML = html;
    lastHtml = html;
  }
  syncOverlayFontSize();
  updateLift();
  startLiftPolling();
  ensureCaptionObserver();
}

/** Drop any active caption override and restore NRK's own on-video caption. */
export function clearNativeCaptionOverride(): void {
  overrideActive = false;
  lastHtml = null;
  const host = subtitleHost();
  if (host) host.classList.remove(SUPPRESS_CLASS);
  if (rootEl) {
    rootEl.classList.remove(ROOT_REL_CLASS);
    rootEl = null;
  }
  if (overrideEl) {
    overrideEl.parentElement?.removeChild(overrideEl);
    overrideEl.innerHTML = "";
    overrideEl.classList.remove(LIFT_CLASS);
  }
  stopLiftPolling();
  stopCaptionObserver();
}
