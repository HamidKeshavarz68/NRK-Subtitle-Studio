/**
 * Injects a gear/settings button into the NRK player's bottom control bar, right
 * beside the subtitle and fullscreen buttons, so the extension's settings menu
 * can be opened straight from the video's bottom-right corner.
 *
 * NRK's player is the custom `player-core-web` web component (`<tv-player>`), not
 * Shaka's built-in UI, but its controls live in the light DOM: the bottom bar is
 * `#player-controls` and every control is a `button.tv-player-button` wrapping an
 * `<svg>`. Each has a stable, non-standard `type` hook (e.g.
 * `type="fullscreen-button"`, `type="subtitles-button"`). We reuse NRK's own
 * button classes so it matches the native controls, and insert it just before
 * the subtitle button (to the left of both the subtitle and fullscreen icons).
 * The button shows the extension's own icon so it clearly belongs to us.
 */

import { closeSettings, isSettingsOpen, toggleSettings } from "./settings-popover";
import { statusEl } from "./elements";
import { onUiLangChange, t } from "./i18n";
import { runtime } from "../../shared/extension/runtime";

const BTN_CLASS = "nsr-player-btn";
// NRK's own control-button classes (reused so ours matches sizing/hover/radius).
const NRK_BTN_CLASSES =
  "tv-player-button hover:background-color-theme-dark-opacity-75 border-radius-l-expressive";

// The extension's own icon (declared in web_accessible_resources).
const ICON_URL = runtime.getURL("public/icons/icon-128.png");

let button: HTMLButtonElement | null = null;

/**
 * Find where our button should go. Prefer sitting just before the subtitle
 * button (left of both native icons); otherwise before the fullscreen button;
 * otherwise at the end of the bottom control bar.
 */
function findInsertTarget(): { anchor: HTMLElement; before: boolean } | null {
  const subtitle = document.querySelector(
    'button[type="subtitles-button"]'
  ) as HTMLElement | null;
  if (subtitle) return { anchor: subtitle, before: true };

  const fullscreen = document.querySelector(
    'button[type="fullscreen-button"]'
  ) as HTMLElement | null;
  if (fullscreen) return { anchor: fullscreen, before: true };

  const controls = document.querySelector("#player-controls");
  const buttons = controls
    ? Array.from(controls.querySelectorAll<HTMLElement>(".tv-player-button"))
    : [];
  const last = buttons[buttons.length - 1];
  return last ? { anchor: last, before: false } : null;
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = NRK_BTN_CLASSES + " " + BTN_CLASS;
  const img = document.createElement("img");
  img.src = ICON_URL;
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.className = "nsr-player-btn-icon";
  img.draggable = false;
  btn.appendChild(img);
  btn.tabIndex = 0;
  btn.title = t("settings_open");
  btn.setAttribute("aria-label", t("settings_open"));
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSettings(btn);
  });
  // Stop the player from treating the press as a play/seek/fullscreen gesture.
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  btn.addEventListener("dblclick", (e) => e.stopPropagation());
  return btn;
}

/** Add the settings button (and the status indicator to its left) to the player
 * control bar if they aren't there yet. */
export function injectSettingsButton(): void {
  // Already present and still attached → make sure the status sits just to the
  // left of the button, then stop.
  const existing = document.querySelector("." + BTN_CLASS) as HTMLButtonElement | null;
  if (existing && existing.isConnected) {
    button = existing;
    ensureStatusBeside(button);
    return;
  }

  const target = findInsertTarget();
  if (!target || !target.anchor.parentElement) return;

  const parent = target.anchor.parentElement;
  button = createButton();
  if (target.before) {
    parent.insertBefore(button, target.anchor);
  } else {
    parent.insertBefore(button, target.anchor.nextSibling);
  }
  ensureStatusBeside(button);
}

/** Keep the "no → en" status indicator directly to the left of our button. */
function ensureStatusBeside(btn: HTMLButtonElement): void {
  if (statusEl.nextElementSibling !== btn || statusEl.parentElement !== btn.parentElement) {
    btn.parentElement?.insertBefore(statusEl, btn);
  }
}

/** Remove the button, status and close the popover (used when tearing down). */
export function removePlayerButton(): void {
  if (isSettingsOpen()) closeSettings();
  statusEl.remove();
  button?.remove();
  button = null;
}

// Keep the tooltip in sync when the user switches the menu language.
onUiLangChange(() => {
  if (button) {
    button.title = t("settings_open");
    button.setAttribute("aria-label", t("settings_open"));
  }
});
