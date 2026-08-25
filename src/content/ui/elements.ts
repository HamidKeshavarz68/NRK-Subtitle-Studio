import { OVERLAY_ID, TRANSLATORS, UI_LANGS } from "../core/config";
import { runtime } from "../../shared/extension/runtime";

const ICON_URL = (() => {
  try {
    return runtime.getURL("public/icons/icon-128.png");
  } catch {
    return "";
  }
})();

const VERSION = (() => {
  try {
    return runtime.getManifest().version || "";
  } catch {
    return "";
  }
})();

const REPO_URL = "https://github.com/HamidKeshavarz68/NRK-Subtitle-Studio";
const WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/nrk-subtitle-studio/mcnkomopjmjaoamdpjmpokoboheekapf";
const CONTACT_EMAIL = "hamidkeshavarz68@gmail.com";

export const overlay = document.createElement("div");
overlay.id = OVERLAY_ID;
overlay.innerHTML = `
  <div class="nsr-header" title="Drag to move">
    ${ICON_URL ? `<img class="nsr-icon" src="${ICON_URL}" alt="" />` : "📜"}
    <span class="nsr-title">NRK Subtitle Studio</span>
  </div>
  <div class="nsr-notice" role="status" aria-live="polite" hidden></div>
  <div class="nsr-settings" hidden>
    <div class="nsr-settings-title-row">
      <div class="nsr-settings-title" data-i18n="settings_heading">Settings</div>
      <button class="nsr-settings-close" type="button" title="Close" aria-label="Close">×</button>
    </div>
    <label class="nsr-settings-row">
      <span data-i18n="setting_view_mode">Subtitle view</span>
      <select class="nsr-sel" data-act="view-mode" title="Subtitle view">
        <option value="rolling">Rolling list</option>
        <option value="single">Single line (NRK)</option>
      </select>
    </label>
    <label class="nsr-settings-row">
      <span data-i18n="setting_ui_language">Menu language</span>
      <select class="nsr-sel" data-act="set-uilang">
        ${UI_LANGS.map((language) => `<option value="${language.code}">${language.name}</option>`).join("")}
      </select>
    </label>
    <div class="nsr-settings-row" data-row="font-size">
      <span data-i18n="setting_font_size">Text size</span>
      <span class="nsr-group nsr-group-font">
        <button class="nsr-btn" type="button" data-act="font-down" title="Smaller text">A−</button>
        <span class="nsr-font-value" data-act="font-value" aria-live="polite">12</span>
        <button class="nsr-btn" type="button" data-act="font-up" title="Larger text">A+</button>
      </span>
    </div>
    <label class="nsr-settings-row">
      <span data-i18n="setting_playback_speed">Playback speed</span>
      <select class="nsr-sel" data-act="speed" title="Playback speed">
        <option value="0.6">0.6×</option>
        <option value="0.7">0.7×</option>
        <option value="0.8">0.8×</option>
        <option value="0.9">0.9×</option>
        <option value="0.95">0.95×</option>
        <option value="1">1×</option>
        <option value="1.1">1.1×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
        <option value="1.75">1.75×</option>
        <option value="2">2×</option>
      </select>
    </label>
    <label class="nsr-settings-row">
      <span data-i18n="setting_display_mode">Display mode</span>
      <select class="nsr-sel" data-act="mode" title="Display mode">
        <option value="original">Original</option>
        <option value="translated">Translated</option>
        <option value="bilingual">Bilingual</option>
      </select>
    </label>
    <label class="nsr-settings-row nsr-row-lang">
      <span data-i18n="setting_target_lang">Translate to</span>
      <select class="nsr-sel" data-act="lang" title="Translate to…"></select>
    </label>
    <div class="nsr-settings-row nsr-settings-row-download nsr-group-download" hidden>
      <button class="nsr-btn nsr-btn-text nsr-download-btn" data-act="download" title="Download subtitles (.srt)" aria-label="Download subtitles">Download subtitle</button>
    </div>
    <label class="nsr-settings-row">
      <span data-i18n="setting_translator">Translator</span>
      <select class="nsr-sel" data-act="set-translator">
        ${TRANSLATORS.map((provider) => `<option value="${provider.code}">${provider.name}</option>`).join("")}
      </select>
    </label>
    <div class="nsr-settings-row nsr-settings-row-col nsr-row-deepl-key" hidden>
      <span data-i18n="setting_deepl_key">DeepL API key</span>
      <input class="nsr-input" type="password" data-act="set-deepl-key" autocomplete="off"
        autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="Paste your DeepL API key" />
    </div>
    <div class="nsr-settings-foot">
      <div class="nsr-settings-feedback" data-i18n="feedback_intro">Found a bug or have a suggestion?</div>
      <div class="nsr-settings-links">
        <a class="nsr-link" href="mailto:${CONTACT_EMAIL}" data-i18n="feedback_email">Email the author</a>
        <span class="nsr-dot">·</span>
        <a class="nsr-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer" data-i18n="feedback_repo">GitHub repository</a>
        <span class="nsr-dot">·</span>
        <a class="nsr-link" href="${WEBSTORE_URL}" target="_blank" rel="noopener noreferrer" data-i18n="feedback_webstore">Rate on Chrome Web Store</a>
      </div>
      <div class="nsr-settings-version">${VERSION ? `v${VERSION}` : ""}</div>
    </div>
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

export const listEl = overlay.querySelector(".nsr-list") as HTMLDivElement;
export const footEl = overlay.querySelector(".nsr-foot") as HTMLDivElement;
export const settingsPanel = overlay.querySelector(".nsr-settings") as HTMLDivElement;

export const statusEl = document.createElement("span");
statusEl.className = "nsr-status nsr-player-status";
statusEl.textContent = "waiting…";

export const settingsHost = document.createElement("div");
settingsHost.className = "nsr-settings-host";
settingsHost.hidden = true;
