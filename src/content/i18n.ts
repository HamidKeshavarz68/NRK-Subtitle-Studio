/**
 * Tiny i18n layer for the overlay's own UI strings.
 *
 * Holds the current menu language and a per-locale message table. Modules call
 * `t(key)` to read a string; `setUiLang()` switches the active locale. The
 * overlay re-applies all static text via `applyI18n()` (registered as a
 * listener) whenever the language changes.
 */

import { DEFAULT_UI_LANG, STORAGE_KEYS, UiLang } from "./config";
import { readStorage, writeStorage } from "./utils";

export type MessageKey =
  | "status_waiting"
  | "translate_to"
  | "display_mode"
  | "mode_original"
  | "mode_translated"
  | "mode_bilingual"
  | "playback_speed"
  | "font_smaller"
  | "font_larger"
  | "hide"
  | "show"
  | "hide_title"
  | "show_title"
  | "tip"
  | "empty"
  | "translation_failed"
  | "no_translation"
  | "settings_open"
  | "settings_heading"
  | "setting_enable_translation"
  | "setting_ui_language"
  | "feedback_intro"
  | "feedback_email"
  | "feedback_repo";

type Messages = Record<MessageKey, string>;

const MESSAGES: Record<UiLang, Messages> = {
  en: {
    status_waiting: "waiting…",
    translate_to: "Translate to…",
    display_mode: "Display mode",
    mode_original: "Original",
    mode_translated: "Translated",
    mode_bilingual: "Bilingual",
    playback_speed: "Playback speed",
    font_smaller: "Smaller text",
    font_larger: "Larger text",
    hide: "Hide",
    show: "Show",
    hide_title: "Hide subtitle list",
    show_title: "Show subtitle list",
    tip: "Tip: enable subtitles in the NRK player so they get downloaded.",
    empty:
      "Waiting for subtitles…<br/>Open the NRK player's CC/subtitle menu and " +
      "select a language — every cue will then be loaded and rolled here.",
    translation_failed: "Translation failed (click cue to retry by changing language)",
    no_translation: "— No translation —",
    settings_open: "Settings",
    settings_heading: "Settings",
    setting_enable_translation: "Enable translation",
    setting_ui_language: "Menu language",
    feedback_intro: "Found a bug, issue or have a suggestion?",
    feedback_email: "Email the author",
    feedback_repo: "GitHub repository",
  },
  no: {
    status_waiting: "venter…",
    translate_to: "Oversett til…",
    display_mode: "Visningsmodus",
    mode_original: "Original",
    mode_translated: "Oversatt",
    mode_bilingual: "Tospråklig",
    playback_speed: "Avspillingshastighet",
    font_smaller: "Mindre tekst",
    font_larger: "Større tekst",
    hide: "Skjul",
    show: "Vis",
    hide_title: "Skjul undertekstliste",
    show_title: "Vis undertekstliste",
    tip: "Tips: slå på undertekster i NRK-spilleren slik at de lastes ned.",
    empty:
      "Venter på undertekster…<br/>Åpne NRK-spillerens undertekstmeny og velg " +
      "et språk — hver linje lastes da inn og rulles her.",
    translation_failed: "Oversettelsen mislyktes (klikk på linjen for å prøve igjen ved å bytte språk)",
    no_translation: "— Ingen oversettelse —",
    settings_open: "Innstillinger",
    settings_heading: "Innstillinger",
    setting_enable_translation: "Aktiver oversettelse",
    setting_ui_language: "Menyspråk",
    feedback_intro: "Funnet en feil eller har et forslag?",
    feedback_email: "Send e-post til utvikleren",
    feedback_repo: "GitHub-repositorium",
  },
};

function normalizeLang(value: string | null): UiLang {
  return value === "no" || value === "en" ? value : DEFAULT_UI_LANG;
}

let currentLang: UiLang = normalizeLang(readStorage(STORAGE_KEYS.uiLang));

const listeners = new Set<() => void>();

export const getUiLang = (): UiLang => currentLang;

export function t(key: MessageKey): string {
  return MESSAGES[currentLang][key];
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onUiLangChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUiLang(lang: UiLang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  writeStorage(STORAGE_KEYS.uiLang, lang);
  listeners.forEach((fn) => fn());
}
