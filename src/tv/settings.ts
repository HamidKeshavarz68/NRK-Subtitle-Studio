/** Persisted user settings for the TV app (stored in localStorage). */

import type { DisplayMode } from "../content/core/config";

export type { DisplayMode } from "../content/core/config";

/** Where subtitles are drawn during playback. */
export type SubtitleLayout = "side" | "bottom" | "off";

export interface TvSettings {
  /** BCP-47 base code, or "off" to disable translation. */
  targetLang: string;
  displayMode: DisplayMode;
  layout: SubtitleLayout;
  fontSize: number;
  /** Optional base URL of `npm run serve:tv` used when direct requests are blocked. */
  proxyUrl: string;
  /** Optional DeepL API key; empty = use Google Translate. */
  deeplApiKey: string;
}

export const FONT_SIZES = [24, 28, 32, 36, 42, 48, 56, 64, 72, 84];
export const DISPLAY_MODES: { code: DisplayMode; name: string }[] = [
  { code: "bilingual", name: "Bilingual" },
  { code: "original", name: "Original only" },
  { code: "translated", name: "Translation only" },
];
export const LAYOUTS: { code: SubtitleLayout; name: string }[] = [
  { code: "side", name: "Side panel (scrolling)" },
  { code: "bottom", name: "Bottom captions" },
  { code: "off", name: "Hidden" },
];

const STORAGE_KEY = "nss.tv.settings";

const RTL_LANGS = ["ar", "fa", "ur", "ckb", "he", "iw", "ps", "yi", "sd", "ug", "dv"];

/** True for languages written right to left (Persian, Arabic, Urdu, Sorani, Hebrew…). */
export function isRtl(code: string): boolean {
  return RTL_LANGS.indexOf(code.toLowerCase().split("-")[0]) !== -1;
}

const DEFAULTS: TvSettings = {
  targetLang: "en",
  displayMode: "bilingual",
  layout: "side",
  fontSize: 32,
  proxyUrl: "",
  deeplApiKey: "",
};

function load(): TvSettings {
  const out: TvSettings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TvSettings>;
      if (typeof parsed.targetLang === "string") out.targetLang = parsed.targetLang;
      if (DISPLAY_MODES.some((m) => m.code === parsed.displayMode)) out.displayMode = parsed.displayMode!;
      if (LAYOUTS.some((l) => l.code === parsed.layout)) out.layout = parsed.layout!;
      if (typeof parsed.fontSize === "number" && FONT_SIZES.indexOf(parsed.fontSize) !== -1) {
        out.fontSize = parsed.fontSize;
      }
      if (typeof parsed.proxyUrl === "string") out.proxyUrl = parsed.proxyUrl;
      if (typeof parsed.deeplApiKey === "string") out.deeplApiKey = parsed.deeplApiKey;
    }
  } catch {
    // Corrupt or unavailable storage: fall back to defaults.
  }
  return out;
}

export const settings: TvSettings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/** Return the item after `current` in `list`, wrapping around. */
export function cycle<T>(list: T[], current: T, step = 1): T {
  const i = list.indexOf(current);
  const n = list.length;
  return list[(((i < 0 ? 0 : i) + step) % n + n) % n];
}
