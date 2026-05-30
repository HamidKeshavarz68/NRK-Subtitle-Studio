/**
 * Overlay DOM, toolbar controls and direct interactions (font, speed, drag,
 * resize, collapse/expand, click-to-seek). Owns the overlay element and the
 * references the renderer writes into.
 */

import {
  DisplayMode,
  FONT,
  LANGS,
  OVERLAY_ID,
  STORAGE_KEYS,
  WINDOW_MIN,
} from "./config";
import {
  applyPlaybackRate,
  setDisplayMode,
  setFontSize,
  setPlaybackRate,
  setTargetLang,
  settings,
  state,
  ui,
} from "./state";
import { readStorage, writeStorage } from "./utils";
import { invalidateRender, render, updateStatus } from "./renderer";
import { onTranslationConfigChanged } from "./translator";
import { applyNativeSubtitleVisibility } from "./native-subtitles";

declare const chrome: any;

const ICON_URL = (() => {
  try {
    return chrome.runtime.getURL("public/icons/icon.svg");
  } catch {
    return "";
  }
})();

export const overlay = document.createElement("div");
overlay.id = OVERLAY_ID;
overlay.innerHTML = `
  <div class="nsr-header">
    <span class="nsr-title">${ICON_URL ? `<img class="nsr-icon" src="${ICON_URL}" alt="" />` : "📜"} NRK Subtitle Studio</span>
    <span class="nsr-status">waiting…</span>
    <span class="nsr-group nsr-group-translate">
      <select class="nsr-sel" data-act="lang" title="Translate to…"></select>
      <select class="nsr-sel" data-act="mode" title="Display mode">
        <option value="original">Original</option>
        <option value="translated">Translated</option>
        <option value="bilingual">Bilingual</option>
      </select>
    </span>
    <span class="nsr-group nsr-group-speed">
      <select class="nsr-sel" data-act="speed" title="Playback speed">
        <option value="0.5">0.5×</option>
        <option value="0.6">0.6×</option>
        <option value="0.7">0.7×</option>
        <option value="0.8">0.8×</option>
        <option value="0.9">0.9×</option>
        <option value="1">1×</option>
        <option value="1.1">1.1×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
        <option value="1.75">1.75×</option>
        <option value="2">2×</option>
      </select>
    </span>
    <span class="nsr-group nsr-group-font">
      <button class="nsr-btn" data-act="font-down" title="Smaller text">A−</button>
      <button class="nsr-btn" data-act="font-up" title="Larger text">A+</button>
    </span>
    <span class="nsr-group nsr-group-toggle">
      <button class="nsr-btn nsr-btn-text" data-act="toggle" title="Hide subtitle list">Hide</button>
    </span>
  </div>
  <div class="nsr-body">
    <div class="nsr-list"></div>
    <div class="nsr-foot">
      <small>Tip: enable subtitles in the NRK player so they get downloaded.</small>
    </div>
  </div>
  <div class="nsr-rh nsr-rh-n"  data-dir="n"></div>
  <div class="nsr-rh nsr-rh-s"  data-dir="s"></div>
  <div class="nsr-rh nsr-rh-w"  data-dir="w"></div>
  <div class="nsr-rh nsr-rh-e"  data-dir="e"></div>
  <div class="nsr-rh nsr-rh-nw" data-dir="nw"></div>
  <div class="nsr-rh nsr-rh-ne" data-dir="ne"></div>
  <div class="nsr-rh nsr-rh-sw" data-dir="sw"></div>
  <div class="nsr-rh nsr-rh-se" data-dir="se"></div>`;
// The overlay is only inserted into the DOM on video pages (see index.ts).

export const listEl = overlay.querySelector(".nsr-list") as HTMLDivElement;
export const statusEl = overlay.querySelector(".nsr-status") as HTMLSpanElement;
const bodyEl = overlay.querySelector(".nsr-body") as HTMLDivElement;

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
}
document.addEventListener("fullscreenchange", syncFullscreenParent);
document.addEventListener("webkitfullscreenchange", syncFullscreenParent as EventListener);

let savedExpandedHeight = "";

// ---------- Font size ----------
function renderFontSize(): void {
  overlay.style.setProperty("--nsr-cue-size", settings.fontSize + "px");
}
renderFontSize();

// ---------- Window size (persisted) ----------
// Only apply saved size if it meets a reasonable minimum; otherwise let the
// CSS default (viewport-relative) take effect.
const SIZE_MIN_THRESHOLD = { w: 400, h: 500 };

function loadSize(): { w: number; h: number } | null {
  try {
    const raw = readStorage(STORAGE_KEYS.size);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o?.w === "number" && typeof o?.h === "number") {
      if (o.w >= SIZE_MIN_THRESHOLD.w && o.h >= SIZE_MIN_THRESHOLD.h) {
        return o;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
const savedSize = loadSize();
if (savedSize) {
  overlay.style.width = savedSize.w + "px";
  overlay.style.height = savedSize.h + "px";
}

// Persist size changes, but not while collapsed (height is "auto" then and we
// don't want to overwrite the user's preferred expanded height).
let resizeSaveTimer: number | null = null;
let suppressSizeSave = false;
const ro = new ResizeObserver(() => {
  if (suppressSizeSave || resizeSaveTimer !== null) return;
  resizeSaveTimer = self.setTimeout(() => {
    resizeSaveTimer = null;
    if (suppressSizeSave) return;
    const r = overlay.getBoundingClientRect();
    writeStorage(STORAGE_KEYS.size, JSON.stringify({
      w: Math.round(r.width),
      h: Math.round(r.height),
    }));
  }, 150);
});
ro.observe(overlay);

// ---------- Playback speed ----------
const speedSel = overlay.querySelector('select[data-act="speed"]') as HTMLSelectElement;
speedSel.value = String(settings.playbackRate);
speedSel.addEventListener("change", () => {
  setPlaybackRate(parseFloat(speedSel.value) || 1);
});

// ---------- Custom resize from any edge / corner ----------
// Eight invisible handles translate mouse drags into width/height/top/left.
overlay.querySelectorAll<HTMLElement>(".nsr-rh").forEach((handle) => {
  handle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = handle.dataset.dir || "";
    const start = overlay.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const maxW = Math.min(window.innerWidth * 0.95, window.innerWidth - 4);
    const maxH = Math.min(window.innerHeight * 0.95, window.innerHeight - 4);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let left = start.left;
      let top = start.top;
      let w = start.width;
      let h = start.height;

      if (dir.includes("e")) w = start.width + dx;
      if (dir.includes("s")) h = start.height + dy;
      if (dir.includes("w")) { w = start.width - dx; left = start.left + dx; }
      if (dir.includes("n")) { h = start.height - dy; top = start.top + dy; }

      // Clamp width
      if (w < WINDOW_MIN.width) {
        if (dir.includes("w")) left -= WINDOW_MIN.width - w;
        w = WINDOW_MIN.width;
      }
      if (w > maxW) {
        if (dir.includes("w")) left += w - maxW;
        w = maxW;
      }
      // Clamp height
      if (h < WINDOW_MIN.height) {
        if (dir.includes("n")) top -= WINDOW_MIN.height - h;
        h = WINDOW_MIN.height;
      }
      if (h > maxH) {
        if (dir.includes("n")) top += h - maxH;
        h = maxH;
      }
      // Keep on screen
      if (left < 0) { w += left; left = 0; }
      if (top < 0) { h += top; top = 0; }
      if (left + w > window.innerWidth) w = window.innerWidth - left;
      if (top + h > window.innerHeight) h = window.innerHeight - top;

      // Switch positioning to top/left so it stays put.
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
      overlay.style.left = left + "px";
      overlay.style.top = top + "px";
      overlay.style.width = w + "px";
      overlay.style.height = h + "px";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // The ResizeObserver above persists the new size.
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
});

// ---------- Translation selects ----------
const langSel = overlay.querySelector('select[data-act="lang"]') as HTMLSelectElement;
const modeSel = overlay.querySelector('select[data-act="mode"]') as HTMLSelectElement;
langSel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
langSel.value = settings.targetLang;
modeSel.value = settings.displayMode;

function syncModeSelVisibility(): void {
  modeSel.style.display = settings.targetLang === "off" ? "none" : "";
}
function syncLangSelVisibility(): void {
  // No need to pick a target language if the user only wants the original.
  langSel.style.display = settings.displayMode === "original" ? "none" : "";
}
syncModeSelVisibility();
syncLangSelVisibility();

langSel.addEventListener("change", () => {
  setTargetLang(langSel.value);
  syncModeSelVisibility();
  onTranslationConfigChanged();
});
modeSel.addEventListener("change", () => {
  setDisplayMode(modeSel.value as DisplayMode);
  syncLangSelVisibility();
  updateStatus();
  invalidateRender();
  render();
});

// ---------- Toolbar buttons (toggle / font) ----------
function toggleExpanded(button: HTMLElement): void {
  const collapsed = bodyEl.style.display === "none";
  bodyEl.style.display = collapsed ? "" : "none";
  const nowCollapsed = !collapsed;
  ui.isExpanded = !nowCollapsed;

  // Shrink to header-only when collapsed; restore previous height when expanded.
  if (nowCollapsed) {
    savedExpandedHeight = overlay.style.height || overlay.getBoundingClientRect().height + "px";
    suppressSizeSave = true;
    overlay.style.height = "auto";
    overlay.style.minHeight = "0";
  } else {
    overlay.style.height = savedExpandedHeight || "";
    overlay.style.minHeight = "";
    self.setTimeout(() => { suppressSizeSave = false; }, 200);
  }
  button.textContent = nowCollapsed ? "Show" : "Hide";
  button.title = nowCollapsed ? "Show subtitle list" : "Hide subtitle list";
  applyNativeSubtitleVisibility();
}

overlay.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  switch (target.dataset.act) {
    case "toggle":
      toggleExpanded(target);
      break;
    case "font-up":
      setFontSize(settings.fontSize + FONT.step);
      renderFontSize();
      break;
    case "font-down":
      setFontSize(settings.fontSize - FONT.step);
      renderFontSize();
      break;
  }
});

// ---------- Click-to-seek ----------
listEl.addEventListener("click", (e) => {
  const cueEl = (e.target as HTMLElement).closest(".nsr-cue") as HTMLElement | null;
  if (!cueEl || !state.video) return;
  const s = parseFloat(cueEl.dataset.start || "0");
  if (!isNaN(s)) state.video.currentTime = s;
});

// ---------- Dragging ----------
makeDraggable(overlay, overlay.querySelector(".nsr-header") as HTMLElement);

function makeDraggable(el: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let sx = 0, sy = 0, ox = 0, oy = 0;
  handle.addEventListener("mousedown", (e: MouseEvent) => {
    // Don't drag when clicking interactive controls.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = el.getBoundingClientRect();
    ox = r.left; oy = r.top;
    el.style.right = "auto";
    el.style.bottom = "auto";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    el.style.left = Math.max(0, ox + e.clientX - sx) + "px";
    el.style.top = Math.max(0, oy + e.clientY - sy) + "px";
  });
  window.addEventListener("mouseup", () => { dragging = false; });
}

// Re-apply the persisted playback rate if/when a video is present.
applyPlaybackRate();
