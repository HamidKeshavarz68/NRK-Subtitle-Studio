/**
 * Minimal, self-contained toast for short-lived notices (e.g. the DeepL →
 * Google fallback warning). Kept dependency-free (no overlay/renderer imports)
 * so it can be used from the translator without creating an import cycle.
 *
 * The element is fixed-position and reparented into the fullscreen element when
 * needed, so it stays visible over the NRK player in fullscreen too.
 */

const TOAST_ID = "nrk-sub-roller-toast";

let toastEl: HTMLDivElement | null = null;
let hideTimer: number | null = null;

function ensureToast(): HTMLDivElement {
  if (toastEl && toastEl.isConnected) return toastEl;
  const el = document.createElement("div");
  el.id = TOAST_ID;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  toastEl = el;
  return el;
}

/** Show a brief message for `durationMs`, then fade out. */
export function showToast(message: string, durationMs = 4000): void {
  const el = ensureToast();
  el.textContent = message;

  // Reparent into the fullscreen subtree (if any) so it renders on top.
  const home = (document.fullscreenElement as HTMLElement | null) ?? document.documentElement;
  if (el.parentElement !== home) home.appendChild(el);

  // Force reflow so the fade-in transition runs on re-shows.
  void el.offsetWidth;
  el.classList.add("nsr-toast-show");

  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = self.setTimeout(() => {
    hideTimer = null;
    el.classList.remove("nsr-toast-show");
  }, Math.max(1000, durationMs));
}
