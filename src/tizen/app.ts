import type { Cue, DisplayMode, SubtitleTrack } from "./core/types";
import { formatTime } from "./core/utils";
import { loadProgram, loadSubtitleCues } from "./services/nrk";
import { clearTranslationCache, enqueueTranslate } from "./services/translator";

type TizenAppHandle = { exit(): void };
type TizenGlobal = {
  application?: {
    getCurrentApplication(): TizenAppHandle;
  };
};

const ROLL_PAST = 3;
const ROLL_FUTURE = 12;

const LANGS: { code: string; label: string }[] = [
  { code: "off", label: "No translation" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pl", label: "Polski" },
  { code: "ar", label: "العربية" },
  { code: "fa", label: "فارسی" },
  { code: "uk", label: "Українська" },
];

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required app element: ${id}`);
  return el as T;
}

const appInput = getElement<HTMLInputElement>("nrk-input");
const loadBtn = getElement<HTMLButtonElement>("load-btn");
const subtitleSelect = getElement<HTMLSelectElement>("subtitle-track");
const langSelect = getElement<HTMLSelectElement>("target-lang");
const modeSelect = getElement<HTMLSelectElement>("display-mode");
const fontMinusBtn = getElement<HTMLButtonElement>("font-minus");
const fontPlusBtn = getElement<HTMLButtonElement>("font-plus");
const fontValue = getElement<HTMLElement>("font-value");
const statusEl = getElement<HTMLElement>("status");
const videoEl = getElement<HTMLVideoElement>("player");
const cueList = getElement<HTMLElement>("cue-list");

for (const lang of LANGS) {
  const opt = document.createElement("option");
  opt.value = lang.code;
  opt.textContent = lang.label;
  langSelect.appendChild(opt);
}

let cues: Cue[] = [];
let tracks: SubtitleTrack[] = [];
let displayMode: DisplayMode = "original";
let targetLang = "off";
let sourceLang = "no";
let fontSize = 34;
let translationWarningShown = false;
const translated = new Map<number, string>();
const translateErrors = new Set<number>();
let lastRenderSignature = "";

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function applyFontSize(): void {
  cueList.style.setProperty("--cue-font-size", `${fontSize}px`);
  fontValue.textContent = `${fontSize}px`;
}

function findCuePosition(time: number): { active: number; anchor: number } {
  if (!cues.length) return { active: -1, anchor: 0 };
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return { active: -1, anchor: 0 };
  if (time > cues[idx].end) return { active: -1, anchor: idx };
  return { active: idx, anchor: idx };
}

function enqueueWindowTranslations(from: number, to: number): void {
  if (targetLang === "off" || displayMode === "original") return;
  for (let i = from; i <= to; i++) {
    if (i < 0 || i >= cues.length) continue;
    if (translated.has(i) || translateErrors.has(i)) continue;
    const text = cues[i].text;
    enqueueTranslate(
      text,
      sourceLang || "no",
      targetLang,
      (result) => {
        translated.set(i, result);
        renderCues(true);
      },
      () => {
        translateErrors.add(i);
        if (!translationWarningShown) {
          translationWarningShown = true;
          setStatus("Some translations failed. Showing original where needed.");
        }
        renderCues(true);
      }
    );
  }
}

function renderCueLine(cue: Cue, idx: number, active: boolean): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = `cue-row${active ? " active" : ""}`;
  row.dataset.index = String(idx);
  row.addEventListener("click", () => {
    videoEl.currentTime = cue.start;
    videoEl.play().catch(() => undefined);
    renderCues();
  });

  const ts = document.createElement("span");
  ts.className = "cue-time";
  ts.textContent = formatTime(cue.start);

  const textWrap = document.createElement("span");
  textWrap.className = "cue-text-wrap";

  const original = document.createElement("span");
  original.className = "cue-text";
  original.textContent = cue.text;

  textWrap.appendChild(original);

  if (displayMode !== "original" && targetLang !== "off") {
    const tr = document.createElement("span");
    tr.className = "cue-translation";
    if (displayMode === "translated") {
      original.classList.add("hidden");
    }
    if (translated.has(idx)) {
      tr.textContent = translated.get(idx) || "";
    } else if (translateErrors.has(idx)) {
      tr.textContent = "⚠";
      tr.setAttribute("aria-label", "Translation unavailable");
    } else {
      tr.textContent = "…";
    }
    textWrap.appendChild(tr);
  }

  row.append(ts, textWrap);
  return row;
}

function renderCues(force = false): void {
  if (!cues.length) {
    cueList.innerHTML = "";
    lastRenderSignature = "";
    return;
  }

  const t = videoEl.currentTime || 0;
  const pos = findCuePosition(t);
  const activeIdx = pos.active;
  const anchor = pos.anchor;
  const from = Math.max(0, anchor - ROLL_PAST);
  const to = Math.min(cues.length - 1, anchor + ROLL_FUTURE);
  let translatedCount = 0;
  let errorCount = 0;
  for (let i = from; i <= to; i++) {
    if (translated.has(i)) translatedCount++;
    if (translateErrors.has(i)) errorCount++;
  }
  const signature = `${from}:${to}:${activeIdx}:${displayMode}:${targetLang}:${translatedCount}:${errorCount}`;

  if (!force && signature === lastRenderSignature) return;
  lastRenderSignature = signature;

  cueList.innerHTML = "";
  enqueueWindowTranslations(from, to);

  for (let i = from; i <= to; i++) {
    cueList.appendChild(renderCueLine(cues[i], i, i === activeIdx));
  }
  const active = cueList.querySelector(".cue-row.active") as HTMLElement | null;
  active?.scrollIntoView({ block: "center" });
}

function resetTranslations(): void {
  translated.clear();
  translateErrors.clear();
  translationWarningShown = false;
  clearTranslationCache();
  lastRenderSignature = "";
}

async function loadTrack(index: number): Promise<boolean> {
  if (!tracks[index]) {
    cues = [];
    renderCues();
    setStatus("No subtitle track selected.");
    return false;
  }
  sourceLang = (tracks[index].language || "no").toLowerCase().split("-")[0] || "no";
  setStatus("Loading subtitles…");
  try {
    cues = await loadSubtitleCues(tracks[index]);
    resetTranslations();
    renderCues(true);
    setStatus(`Loaded ${cues.length} subtitles (${sourceLang.toUpperCase()}).`);
    return true;
  } catch (error) {
    cues = [];
    lastRenderSignature = "";
    renderCues();
    setStatus(error instanceof Error ? error.message : "Subtitle loading failed.");
    return false;
  }
}

async function loadFromInput(): Promise<void> {
  const input = appInput.value.trim();
  if (!input) {
    setStatus("Enter an NRK URL or programme id first.");
    return;
  }
  setStatus("Loading programme manifest…");
  subtitleSelect.innerHTML = "";
  tracks = [];
  cues = [];
  renderCues();

  try {
    const program = await loadProgram(input);
    if (program.videoUrl) {
      videoEl.src = program.videoUrl;
      videoEl.load();
    } else {
      setStatus("Programme loaded, but no playable video URL found in manifest.");
    }

    tracks = program.subtitles;
    if (!tracks.length) {
      setStatus("No subtitle tracks available for this programme.");
      return;
    }

    tracks.forEach((track, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      const label = track.label || track.language || `Track ${idx + 1}`;
      opt.textContent = `${label}${track.defaultOn ? " (default)" : ""}`;
      subtitleSelect.appendChild(opt);
    });

    const defaultIdx = tracks.findIndex((t) => t.defaultOn);
    const first = defaultIdx >= 0 ? defaultIdx : 0;
    subtitleSelect.value = String(first);
    const loaded = await loadTrack(first);
    if (loaded) {
      setStatus(
        program.videoUrl
          ? `Programme ${program.programId} loaded successfully.`
          : `Programme ${program.programId} loaded, but no playable video URL was found.`
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to load programme.");
  }
}

loadBtn.addEventListener("click", () => {
  void loadFromInput();
});

subtitleSelect.addEventListener("change", () => {
  void loadTrack(parseInt(subtitleSelect.value || "0", 10) || 0);
});

langSelect.addEventListener("change", () => {
  targetLang = langSelect.value || "off";
  resetTranslations();
  renderCues(true);
});

modeSelect.addEventListener("change", () => {
  const val = modeSelect.value as DisplayMode;
  displayMode = val === "translated" || val === "bilingual" ? val : "original";
  renderCues(true);
});

fontMinusBtn.addEventListener("click", () => {
  fontSize = Math.max(22, fontSize - 2);
  applyFontSize();
});

fontPlusBtn.addEventListener("click", () => {
  fontSize = Math.min(54, fontSize + 2);
  applyFontSize();
});

videoEl.addEventListener("timeupdate", () => renderCues());
videoEl.addEventListener("seeked", () => renderCues());

const focusables = [
  appInput,
  loadBtn,
  subtitleSelect,
  langSelect,
  modeSelect,
  fontMinusBtn,
  fontPlusBtn,
  videoEl,
];
let focusIndex = 0;

function moveFocus(step: number): void {
  focusIndex = (focusIndex + step + focusables.length) % focusables.length;
  focusables[focusIndex].focus();
}

window.addEventListener("keydown", (event) => {
  const keyCode = (event as KeyboardEvent & { keyCode?: number }).keyCode;

  if (keyCode === 10009) {
    event.preventDefault();
    const tizen = (globalThis as typeof globalThis & { tizen?: TizenGlobal }).tizen;
    if (tizen?.application) {
      tizen.application.getCurrentApplication().exit();
      return;
    }
    if (history.length > 1) {
      history.back();
      return;
    }
    setStatus("Back key not available in this runtime.");
    return;
  }

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      moveFocus(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveFocus(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      cueList.scrollBy({ top: -90, behavior: "smooth" });
      break;
    case "ArrowDown":
      event.preventDefault();
      cueList.scrollBy({ top: 90, behavior: "smooth" });
      break;
    case "Enter":
      event.preventDefault();
      document.activeElement instanceof HTMLElement && document.activeElement.click();
      break;
    default:
      break;
  }
});

applyFontSize();
setStatus("Ready. Enter NRK URL/programme id and press Load.");
focusables[focusIndex].focus();
