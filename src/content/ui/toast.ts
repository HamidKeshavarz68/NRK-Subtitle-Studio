/**
 * Short-lived notice bar for transient warnings (e.g. the DeepL -> Google
 * fallback). It renders inside the overlay, directly under the toolbar/header,
 * so it is clearly part of this extension rather than a detached page toast.
 *
 * Kept dependency-free of overlay/renderer (it only looks the elements up in the
 * DOM by id/class) so the translator can call it without creating an import
 * cycle. Because the bar lives inside the overlay, it also follows the overlay
 * into the fullscreen subtree automatically.
 */

import { OVERLAY_ID } from "../core/config";

let hideTimer: number | null = null;

/** The notice element declared in the overlay markup (created lazily if absent). */
function getNoticeEl(): HTMLElement | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  let el = overlay.querySelector<HTMLElement>(".nsr-notice");
  if (!el) {
    el = document.createElement("div");
    el.className = "nsr-notice";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.hidden = true;
    // The notice belongs at the very top of the overlay (there is no longer a
    // header to anchor beneath).
    overlay.insertBefore(el, overlay.firstChild);
  }
  return el;
}

/** Show a brief message under the toolbar for `durationMs`, then hide it. */
export function showToast(message: string, durationMs = 7000): void {
  const el = getNoticeEl();
  if (!el) return;

  el.textContent = message;
  el.hidden = false;
  // Force reflow so the fade-in transition runs on re-shows.
  void el.offsetWidth;
  el.classList.add("nsr-notice-show");

  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = self.setTimeout(() => {
    hideTimer = null;
    el.classList.remove("nsr-notice-show");
    // Wait for the fade-out before removing it from layout.
    self.setTimeout(() => {
      if (!el.classList.contains("nsr-notice-show")) el.hidden = true;
    }, 220);
  }, Math.max(1000, durationMs));
}
