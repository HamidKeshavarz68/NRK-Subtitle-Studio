/**
 * Overlay DOM, toolbar controls and direct interactions (font, speed, drag,
 * resize, collapse/expand, click-to-seek). Owns the overlay element and the
 * references the renderer writes into.
 */

import {
  DisplayMode,
  ViewMode,
  FONT,
  LANGS,
  TranslatorProvider,
  UiLang,
} from "../core/config";
import {
  applyPlaybackRate,
  detectSourceLang,
  isTranslationActive,
  setDeeplApiKey,
  setDisplayMode,
  setViewMode,
  setFontSize,
  setPlaybackRate,
  setTargetLang,
  setTranslator,
  settings,
  state,
} from "../core/state";
import { invalidateRender, render, updateStatus } from "./renderer";
import { clearTranslationCache, onTranslationConfigChanged } from "../translation/translator";
import { getUiLang, onUiLangChange, setUiLang, t } from "./i18n";
import { downloadSrt, hasSubtitles } from "../subtitles/download";
import { applyNativeSubtitleVisibility } from "../subtitles/native-subtitles";
import {
  footEl,
  listEl,
  overlay,
  settingsHost,
  statusEl,
} from "./elements";
import { initializeOverlayWindow } from "./window-interactions";
import {
  mountSettingsPanel,
  syncSettingsHostParent,
} from "./settings-popover";

export { listEl, overlay, settingsHost, statusEl } from "./elements";

// ---------- Fullscreen handling ----------
// In fullscreen only the fullscreen element's subtree renders, so reparent the
// overlay into it and restore it to <html> on exit.
const overlayHome = document.documentElement;
export function syncFullscreenParent(): void {
  const fs = document.fullscreenElement as HTMLElement | null;
  const target = fs ?? overlayHome;
  if (overlay.parentElement !== target) {
    target.appendChild(overlay);
  }
  syncSettingsHostParent(target);
}
document.addEventListener("fullscreenchange", syncFullscreenParent);
document.addEventListener("webkitfullscreenchange", syncFullscreenParent as EventListener);

// ---------- Font size ----------
const fontValueEl = overlay.querySelector('[data-act="font-value"]') as HTMLElement | null;
function renderFontSize(): void {
  overlay.style.setProperty("--nsr-cue-size", settings.fontSize + "px");
  if (fontValueEl) fontValueEl.textContent = String(settings.fontSize);
}
renderFontSize();

// Font buttons live inside the settings panel, whose click handler stops
// propagation, so they need direct listeners rather than the overlay-level
// delegated handler used by the header buttons.
overlay.querySelector('button[data-act="font-up"]')?.addEventListener("click", () => {
  setFontSize(settings.fontSize + FONT.step);
  renderFontSize();
  render(); // also resize the single-mode on-video caption
});
overlay.querySelector('button[data-act="font-down"]')?.addEventListener("click", () => {
  setFontSize(settings.fontSize - FONT.step);
  renderFontSize();
  render();
});

// ---------- Playback speed ----------
const speedSel = overlay.querySelector('select[data-act="speed"]') as HTMLSelectElement;
speedSel.value = String(settings.playbackRate);
speedSel.addEventListener("change", () => {
  setPlaybackRate(parseFloat(speedSel.value) || 1);
});

initializeOverlayWindow(
  overlay,
  overlay.querySelector(".nsr-header") as HTMLElement
);

// ---------- Translation selects ----------
const langSel = overlay.querySelector('select[data-act="lang"]') as HTMLSelectElement;
const langRow = overlay.querySelector(".nsr-row-lang") as HTMLLabelElement;
const modeSel = overlay.querySelector('select[data-act="mode"]') as HTMLSelectElement;
langSel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
langSel.value = settings.targetLang;
modeSel.value = settings.displayMode;

function syncLangSelVisibility(): void {
  // No need to pick a target language if the user only wants the original;
  // hide the whole "Translate to" row in that case. The "Display mode" select
  // above stays visible at all times so it always offers a way out of
  // "original" — otherwise a fresh user (default "off" + "original") would see
  // an empty panel with no control to enable translation.
  langRow.style.display = settings.displayMode === "original" ? "none" : "";
}
syncLangSelVisibility();

// Pick a sensible target language when the user turns translation on without
// having chosen one yet, so switching to Translated/Bilingual has an immediate
// visible effect instead of silently staying "off". Prefer the UI language
// (what the user reads) as long as it differs from the subtitle's source
// language; otherwise fall back to English.
function defaultTargetLang(): string {
  const uiLang = getUiLang();
  const source = detectSourceLang();
  if (uiLang !== source && LANGS.some((l) => l.code === uiLang)) return uiLang;
  return "en";
}

langSel.addEventListener("change", () => {
  setTargetLang(langSel.value);
  syncFontSizeRowVisibility();
  onTranslationConfigChanged();
});
modeSel.addEventListener("change", () => {
  setDisplayMode(modeSel.value as DisplayMode);
  if (settings.displayMode !== "original" && settings.targetLang === "off") {
    const lang = defaultTargetLang();
    setTargetLang(lang);
    langSel.value = lang;
  }
  syncLangSelVisibility();
  syncFontSizeRowVisibility();
  updateStatus();
  invalidateRender();
  render();
});

// ---------- View mode (rolling window vs. NRK's native single line) ----------
const viewSel = overlay.querySelector('select[data-act="view-mode"]') as HTMLSelectElement;
viewSel.value = settings.viewMode;
// Reflect the persisted mode immediately so the window starts hidden in single
// mode (native captions are toggled on mount via applyNativeSubtitleVisibility).
overlay.style.display = settings.viewMode === "single" ? "none" : "";

// The "Text size" control resizes the rolling list, and in single mode it
// resizes our injected caption — but our injected caption only exists when a
// translation is shown. In single mode with "Original" (or translation off),
// NRK renders its own caption and we can't resize it, so hide the control then.
const fontSizeRow = overlay.querySelector('[data-row="font-size"]') as HTMLElement | null;
function syncFontSizeRowVisibility(): void {
  if (!fontSizeRow) return;
  const usable = settings.viewMode !== "single" || isTranslationActive();
  fontSizeRow.style.display = usable ? "" : "none";
}
syncFontSizeRowVisibility();

/**
 * Show/hide the extension's rolling window and NRK's own captions to match the
 * chosen view mode. In "single" mode the overlay window is hidden and NRK's
 * native single-line subtitles are shown; the player-bar button and this
 * settings popover stay available so the user can switch back.
 */
export function applyViewMode(): void {
  const single = settings.viewMode === "single";
  overlay.style.display = single ? "none" : "";
  syncFontSizeRowVisibility();
  applyNativeSubtitleVisibility();
  invalidateRender();
  render();
}

viewSel.addEventListener("change", () => {
  setViewMode(viewSel.value as ViewMode);
  applyViewMode();
});

// ---------- Settings menu ----------
const uiLangSel = overlay.querySelector('select[data-act="set-uilang"]') as HTMLSelectElement;

uiLangSel.value = getUiLang();

uiLangSel.addEventListener("change", () => {
  setUiLang(uiLangSel.value as UiLang);
});

// ---------- Translator provider + DeepL API key ----------
const translatorSel = overlay.querySelector('select[data-act="set-translator"]') as HTMLSelectElement;
const deeplKeyRow = overlay.querySelector(".nsr-row-deepl-key") as HTMLDivElement;
const deeplKeyInput = overlay.querySelector('input[data-act="set-deepl-key"]') as HTMLInputElement;

translatorSel.value = settings.translator;
deeplKeyInput.value = settings.deeplApiKey;

function syncDeeplKeyVisibility(): void {
  deeplKeyRow.hidden = settings.translator !== "deepl";
}
syncDeeplKeyVisibility();

translatorSel.addEventListener("change", () => {
  setTranslator(translatorSel.value as TranslatorProvider);
  syncDeeplKeyVisibility();
  // Provider changed → previously cached results belong to the other engine.
  clearTranslationCache();
  onTranslationConfigChanged();
});

// Persist the key as the user types, but only re-translate once they pause, so
// each keystroke doesn't fire a request. Keep the input from bubbling to the
// document-level "close panel" / drag handlers.
let deeplKeyTimer: number | null = null;
deeplKeyInput.addEventListener("input", () => {
  setDeeplApiKey(deeplKeyInput.value.trim());
  clearTranslationCache();
  if (deeplKeyTimer !== null) clearTimeout(deeplKeyTimer);
  deeplKeyTimer = self.setTimeout(() => {
    deeplKeyTimer = null;
    onTranslationConfigChanged();
  }, 600);
});
deeplKeyInput.addEventListener("keydown", (e) => e.stopPropagation());
deeplKeyInput.addEventListener("pointerdown", (e) => e.stopPropagation());

// ---------- Download subtitles (.srt) ----------
// The button appears once subtitles are available. Clicking fetches the full
// programme subtitles from NRK (translating them when translation is enabled)
// and saves a .srt file; a busy state covers the async fetch/translate work.
const downloadGroup = overlay.querySelector(".nsr-group-download") as HTMLSpanElement;
const downloadBtn = overlay.querySelector('button[data-act="download"]') as HTMLButtonElement;
export function syncDownloadButton(): void {
  const available = hasSubtitles();
  downloadGroup.hidden = !available;
  // The tip only helps users who have not captured any subtitles yet; once
  // subtitles are available (i.e. enabled in the NRK player) it's redundant.
  footEl.hidden = available;
}
syncDownloadButton();
window.addEventListener("nsr-subtitles-updated", syncDownloadButton);

// The download button lives inside the settings panel, whose click handler
// stops propagation, so it needs a direct listener rather than the
// overlay-level delegated handler used by the header buttons.
downloadBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  void handleDownload();
});

let downloadBusy = false;
async function handleDownload(): Promise<void> {
  if (downloadBusy) return;
  downloadBusy = true;
  downloadBtn.disabled = true;
  downloadBtn.classList.add("nsr-btn-busy");
  downloadBtn.setAttribute("aria-busy", "true");
  downloadBtn.textContent = t("download_busy");
  try {
    await downloadSrt();
  } catch (e) {
    console.warn("[nsr] subtitle download failed", e);
  } finally {
    downloadBusy = false;
    downloadBtn.disabled = false;
    downloadBtn.classList.remove("nsr-btn-busy");
    downloadBtn.removeAttribute("aria-busy");
    downloadBtn.textContent = t("download");
  }
}

// ---------- i18n: (re)apply all static UI strings ----------
function applyI18n(): void {
  langSel.title = t("translate_to");
  if (langSel.options.length) langSel.options[0].text = t("no_translation"); // "off" entry
  modeSel.title = t("display_mode");
  setOptionText(modeSel, "original", t("mode_original"));
  setOptionText(modeSel, "translated", t("mode_translated"));
  setOptionText(modeSel, "bilingual", t("mode_bilingual"));
  viewSel.title = t("view_mode");
  setOptionText(viewSel, "rolling", t("view_rolling"));
  setOptionText(viewSel, "single", t("view_single"));
  speedSel.title = t("playback_speed");
  deeplKeyInput.placeholder = t("deepl_key_placeholder");

  setTitle('button[data-act="font-down"]', t("font_smaller"));
  setTitle('button[data-act="font-up"]', t("font_larger"));
  downloadBtn.title = t("download_title");
  downloadBtn.setAttribute("aria-label", t("download_title"));
  downloadBtn.textContent = t("download");

  footEl.innerHTML = `<small>${t("tip")}</small>`;

  [overlay, settingsHost].forEach((root) => {
    root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n as Parameters<typeof t>[0] | undefined;
      if (key) el.textContent = t(key);
    });
  });

  // Status line shows the localized "waiting…" until a track is known.
  if (!state.track) statusEl.textContent = t("status_waiting");

  invalidateRender();
  render();
}

function setOptionText(sel: HTMLSelectElement, value: string, text: string): void {
  const opt = Array.from(sel.options).find((o) => o.value === value);
  if (opt) opt.text = text;
}
function setTitle(selector: string, title: string): void {
  const el = (overlay.querySelector(selector) || settingsHost.querySelector(selector)) as HTMLElement | null;
  if (el) el.title = title;
}

onUiLangChange(applyI18n);
applyI18n();

// ---------- Click-to-seek ----------
listEl.addEventListener("click", (e) => {
  const cueEl = (e.target as HTMLElement).closest(".nsr-cue") as HTMLElement | null;
  if (!cueEl || !state.video) return;
  const s = parseFloat(cueEl.dataset.start || "0");
  if (!isNaN(s)) state.video.currentTime = s;
});

// Re-apply the persisted playback rate if/when a video is present.
applyPlaybackRate();

// Move the settings panel into its standalone popover host now that every
// init-time `overlay.querySelector(...)` lookup above has resolved against it
// while it still lived inside the overlay. From here on it renders as an
// anchored popover (see openSettings / player-controls.ts).
mountSettingsPanel();
