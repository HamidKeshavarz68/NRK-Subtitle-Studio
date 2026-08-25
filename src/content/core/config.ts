/**
 * Shared configuration, constants and types for the content script.
 */

import type { TranslatorProvider } from "../../shared/extension/messages";

export type { TranslatorProvider } from "../../shared/extension/messages";

export type DisplayMode = "original" | "translated" | "bilingual";

/**
 * How subtitles are shown:
 *  - "rolling": the extension's scrolling window with past/upcoming cues.
 *  - "single": the extension window is hidden and NRK's own native single-line
 *    subtitle UI is used instead.
 */
export type ViewMode = "rolling" | "single";

export type TranslationState = "pending" | "done" | "error";
export type UiLang = "en" | "no";

export const DEFAULT_TRANSLATOR: TranslatorProvider = "google";

/** Selectable translation providers (shown in the settings menu). */
export const TRANSLATORS: { code: TranslatorProvider; name: string }[] = [
  { code: "google", name: "Google (free)" },
  { code: "deepl", name: "DeepL (API key)" },
];

export const OVERLAY_ID = "nrk-sub-roller";

/** Selectable UI (menu) languages. */
export const UI_LANGS: { code: UiLang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "no", name: "Norsk" },
];

export const DEFAULT_UI_LANG: UiLang = "en";

/** localStorage keys for all persisted settings. */
export const STORAGE_KEYS = {
  fontSize: "nsr.fontSize",
  size: "nsr.size",
  playbackRate: "nsr.playbackRate",
  targetLang: "nsr.targetLang",
  displayMode: "nsr.displayMode",
  viewMode: "nsr.viewMode",
  uiLang: "nsr.uiLang",
  translator: "nsr.translator",
  deeplApiKey: "nsr.deeplApiKey",
} as const;

export const FONT = { min: 6, max: 36, step: 2, default: 12 } as const;
export const SPEED = { min: 0.25, max: 4, default: 1 } as const;

/** Minimum overlay window size, in px. */
export const WINDOW_MIN = { width: 240, height: 140 } as const;

/** Rolling render window: how many past / upcoming cues to show. */
export const ROLL = { past: 3, future: 12 } as const;

export const TRANSLATE = {
  // Separator joins multiple cues into a single request; unlikely to appear in
  // subtitles and tends to survive translation.
  separator: "\n\n@@@\n\n",
  // Coalescing window for batching enqueued cues into one request.
  coalesceMs: 30,
  // Minimum gap between successive batch requests.
  reqDelayMs: 50,
} as const;

/** tv.nrk.no video URLs typically contain one of these path segments. */
export const VIDEO_PAGE_RE = /\/(episode|program|direkte|film|se)(\/|$)/;

/** Curated translation targets (BCP-47 base codes). "off" disables translation. */
export const LANGS: { code: string; name: string }[] = [
  { code: "off", name: "— No translation —" },
  { code: "en", name: "English" },
  { code: "pl", name: "Polski" },
  { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
  { code: "so", name: "Soomaali" },
  { code: "tr", name: "Türkçe" },
  { code: "uk", name: "Українська" },
  { code: "hi", name: "हिन्दी" },
  { code: "zh", name: "中文" },
  { code: "ur", name: "اردو" },
  { code: "ar", name: "العربية" },
  { code: "fa", name: "فارسی" },
  { code: "az", name: "Azərbaycanca" },
  { code: "da", name: "Dansk" },
  { code: "ku", name: "Kurdî (Kurmanji)" },
  { code: "lt", name: "Lietuvių" },
  { code: "ro", name: "Română" },
  { code: "fi", name: "Suomi" },
  { code: "sv", name: "Svenska" },
  { code: "tl", name: "Tagalog" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "ru", name: "Русский" },
  { code: "ckb", name: "کوردی (Sorani)" },
  { code: "th", name: "ไทย" },
  { code: "ti", name: "ትግርኛ" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
];
