/**
 * Full-screen player with the rolling, translated subtitle panel.
 *
 * Remote:
 *   OK                play / pause
 *   Play/Pause        play / pause
 *   ◀ ▶               seek -/+10 s        ⏪ ⏩  seek -/+30 s
 *                     while paused: move between ⚙ and ▶ in the player bar;
 *                     OK on ⚙ opens the slim options strip along the bottom
 *                     edge (speed, subtitle mode, layout, text size, repeat
 *                     line, start over), Back closes it
 *   ▲ ▼               previous / next subtitle line
 *   Back / Stop       leave the player
 *
 * The colour keys still work as shortcuts on remotes that have them, but
 * nothing depends on them.
 *
 * Speeds other than 1×: Samsung TVs mute their own audio at any rate but 1, so the
 * programme switches from AVPlay to a muted <video> and the sound comes from
 * NRK's DASH audio track, time-stretched in JavaScript (audio/stretch.ts).
 */

import { pop, toast, type Screen } from "../app";
import { parseDashAudio, type DashAudioTrack } from "../audio/dash";
import { audioSupported, StretchedAudio } from "../audio/stretch";
import { LANGS } from "../../content/core/config";
import type { SubtitleCue } from "../../shared/subtitles/vtt";
import { clear, formatTime, h, spinner } from "../dom";
import type { Key } from "../keys";
import {
  createAvplayBackend, createHtml5Backend, hasAvplay, type MediaBackend, type MediaEvents,
} from "../media";
import { fetchText } from "../net";
import {
  dashTwin, getPlayback, loadCues, NotPlayableError, pickSubtitleTrack, type Playback, type Stream,
} from "../nrk";
import {
  cycle, DISPLAY_MODES, FONT_SIZES, formatRate, isRtl, LAYOUTS, saveSettings, settings, SPEEDS,
  type DisplayMode, type SubtitleLayout,
} from "../settings";
import { CueTranslator } from "../translate";

const PAST = 2;
const FUTURE = 8;
const OSD_MS = 4000;
const POS_KEY = "nss.tv.positions";
/** The options strip closes itself after this much inactivity. */
const STRIP_IDLE_MS = 8000;
/** Speed changes settle for this long before the player acts (switching backends is slow). */
const SPEED_DELAY_MS = 500;

const SHORT_MODE: Record<string, string> = { bilingual: "Bilingual", original: "Original", translated: "Translation" };
const SHORT_LAYOUT: Record<string, string> = { side: "Side panel", bottom: "Bottom", off: "Hidden" };

interface StripItem {
  id: string;
  label: string;
  value?: () => string;
  change?: (dir: 1 | -1) => void;
  run?: () => void;
}

/** Step through `list` from `current`, wrapping around. */
function stepIn<T>(list: T[], current: T, dir: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
}

/** Index of the last cue starting at or before `t`, or -1. */
export function cueIndexAt(cues: SubtitleCue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function langName(code: string): string {
  const m = LANGS.filter((l) => l.code === code)[0];
  return m ? m.name : code;
}

function setScreenSaver(on: boolean): void {
  try {
    const ac = window.webapis && window.webapis.appcommon;
    if (!ac) return;
    const states = ac.AppCommonScreenSaverState;
    ac.setScreenSaver(on ? (states ? states.SCREEN_SAVER_ON : 1) : (states ? states.SCREEN_SAVER_OFF : 0));
  } catch {
    // Not on a Samsung TV.
  }
}

function loadPositions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function savePosition(id: string, t: number, duration: number): void {
  const all = loadPositions();
  delete all[id];
  if (t > 30 && (!isFinite(duration) || t < duration - 60)) all[id] = Math.floor(t);
  const keys = Object.keys(all);
  // Keep the 50 most recent entries (insertion order = recency).
  for (let i = 0; i < keys.length - 50; i++) delete all[keys[i]];
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

interface Candidate {
  backend: "avplay" | "html5";
  stream: Stream;
}

/** Ordered (backend, stream) attempts: AVPlay plays everything; <video> gets HLS (and DASH if supported). */
function candidatesFor(streams: Stream[]): Candidate[] {
  const out: Candidate[] = [];
  if (hasAvplay()) for (const s of streams) out.push({ backend: "avplay", stream: s });
  let dashOk = false;
  try {
    dashOk = !!document.createElement("video").canPlayType("application/dash+xml");
  } catch {
    // ignore
  }
  for (const s of streams) if (s.format === "hls") out.push({ backend: "html5", stream: s });
  if (dashOk) for (const s of streams) if (s.format === "dash") out.push({ backend: "html5", stream: s });
  return out;
}

export function createPlayer(kind: "program" | "channel", id: string, fallbackTitle: string): Screen {
  const panelHead = h("div", { class: "subpanel-head" });
  const panelTrack = h("div", { class: "subpanel-track" });
  const panelList = h("div", { class: "subpanel-list" }, panelTrack);
  const panel = h("aside", { class: "subpanel" }, panelHead, panelList);
  const capOrig = h("div", { class: "cap-orig" });
  const capTrans = h("div", { class: "cap-trans" });
  const caption = h("div", { class: "caption" }, h("div", { class: "cap-box" }, capOrig, capTrans));
  const status = h("div", { class: "player-status" }, spinner("Loading…"));

  const osdTitle = h("div", { class: "osd-title", text: fallbackTitle });
  const osdSub = h("div", { class: "osd-sub" });
  const fill = h("div", { class: "progress-fill" });
  const timeCur = h("span", { class: "time" });
  const timeDur = h("span", { class: "time" });
  const gearIcon = h("span", { class: "gear-icon", text: "⚙" });
  const playIcon = h("span", { class: "play-icon", text: "▶" });
  const rateBadge = h("span", { class: "osd-rate" });
  const osd = h(
    "div",
    { class: "osd" },
    h("div", { class: "osd-top" }, osdTitle, osdSub),
    h(
      "div",
      { class: "osd-bottom" },
      h("div", { class: "osd-bar" }, gearIcon, playIcon, timeCur, h("div", { class: "progress" }, fill), timeDur, rateBadge)
    )
  );

  const stage = h("div", { class: "stage" }, caption);
  const stripItems = h("div", { class: "pstrip-items" });
  const strip = h("div", { class: "pstrip" }, stripItems, h("div", { class: "pstrip-hint", text: "▲▼ change · Back close" }));
  const el = h("div", { class: "screen player" }, stage, panel, osd, strip, status);

  let media: MediaBackend | null = null;
  let candidates: Candidate[] = [];
  let attempt = -1;
  let tried: boolean[] = [];
  let failed: boolean[] = [];
  let stripOpen = false;
  let stripSel = 0;
  let stripTimer = 0;
  /** Player-bar button highlighted while paused (◀ ▶ move between them). */
  let ctrl: "play" | "gear" = "play";
  let resumeAt = -1;
  let resumeNotice = false;
  let pb: Playback | null = null;
  let cues: SubtitleCue[] = [];
  let translator: CueTranslator | null = null;
  let subtitleNote = "Loading subtitles…";
  let lastIdx = -2;
  let lastActive = false;
  let dirty = true;
  let osdTimer = 0;
  let destroyed = false;
  let lastSave = 0;
  /** Supplies the sound while the video plays slowed and muted. */
  let stretch: StretchedAudio | null = null;
  let audioTrack: Promise<DashAudioTrack | null> | null = null;
  /** Slowed playback failed for this programme; stay at 1×. */
  let speedBroken = false;
  /** <video> was started only for slowed playback (AVPlay is used at 1×). */
  let speedSwitched = false;
  let speedTimer = 0;

  const tick = window.setInterval(update, 200);

  /* ---------------------------------------------------------- settings */

  function translationWanted(): boolean {
    return settings.targetLang !== "off" && settings.displayMode !== "original";
  }

  function ensureTranslator(): void {
    if (translator || !translationWanted() || !cues.length || !pb) return;
    const track = pickSubtitleTrack(pb.subtitles);
    let notedIssue = "";
    const t = (translator = new CueTranslator(cues, track ? track.language : "nb", settings.targetLang, () => {
      dirty = true;
      if (t.deeplIssue && t.deeplIssue !== notedIssue) {
        notedIssue = t.deeplIssue;
        toast(t.deeplIssue + ": using Google Translate", 5000);
      }
    }));
    translator.focusOn(Math.max(0, cueIndexAt(cues, curTime())));
  }

  function curTime(): number {
    return media ? media.currentTime() : 0;
  }

  function isPaused(): boolean {
    return !media || media.isPaused();
  }

  function setDisplayMode(code: DisplayMode): void {
    settings.displayMode = code;
    saveSettings();
    ensureTranslator();
    dirty = true;
  }

  function setLayout(code: SubtitleLayout): void {
    settings.layout = code;
    saveSettings();
    applyLayout();
  }

  function setFontSize(px: number): void {
    settings.fontSize = px;
    saveSettings();
    applyLayout();
  }

  /* ------------------------------------------------------------- speed */

  function wantedRate(): number {
    return pb && !pb.isLive && !speedBroken ? settings.playbackRate : 1;
  }

  function loadAudioTrack(): Promise<DashAudioTrack | null> {
    if (!audioTrack) {
      const url = pb ? dashTwin(pb.streams) : null;
      // NRK's CDN sends CORS headers, so this normally goes direct like the segments.
      const direct = (u: string): Promise<string> =>
        fetch(u, { credentials: "omit" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status))));
      audioTrack = url
        ? direct(url)
            .catch(() => fetchText(url))
            .then((xml) => parseDashAudio(xml, url))
            .catch(() => null)
        : Promise.resolve(null);
    }
    return audioTrack;
  }

  function dropStretch(): void {
    if (stretch) stretch.destroy();
    stretch = null;
  }

  function firstUsable(backend: Candidate["backend"]): number {
    for (let i = 0; i < candidates.length; i++) if (candidates[i].backend === backend && !failed[i]) return i;
    return -1;
  }

  /** Restart on candidate `i` at the current position. */
  function switchTo(i: number): void {
    const t = curTime();
    const playing = !isPaused();
    if (kind === "program" && t > 0) resumeAt = t;
    speedSwitched = candidates[i].backend === "html5" && hasAvplay();
    startAt(i, playing);
  }

  function speedUnavailable(): void {
    if (speedBroken || destroyed) return;
    speedBroken = true;
    toast("Slower speeds aren't available for this programme", 4000);
    applySpeed();
    if (stripOpen) renderStrip();
  }

  /** Bring the backend and the audio in line with the chosen speed. */
  function applySpeed(): void {
    const r = wantedRate();
    rateBadge.textContent = r !== 1 ? formatRate(r) : "";
    if (!media || destroyed) return;
    if (r === 1) {
      dropStretch();
      if (media.name !== "html5") return;
      const av = speedSwitched ? firstUsable("avplay") : -1;
      if (av >= 0) switchTo(av);
      else if (media.setRate) media.setRate(1, false);
      return;
    }
    if (!audioSupported()) {
      speedUnavailable();
      return;
    }
    if (media.name !== "html5" || !media.setRate) {
      const i = firstUsable("html5");
      if (i < 0) speedUnavailable();
      else switchTo(i);
      return;
    }
    media.setRate(r, true);
    if (stretch) {
      stretch.setRate(r);
      return;
    }
    const m = media;
    void loadAudioTrack().then((track) => {
      if (destroyed || media !== m || stretch || wantedRate() === 1) return;
      if (!track) {
        speedUnavailable();
        return;
      }
      stretch = new StretchedAudio(track, { time: () => m.currentTime(), running: () => m.running() }, speedUnavailable);
      stretch.setRate(wantedRate());
    });
  }

  function setSpeed(r: number): void {
    settings.playbackRate = r;
    saveSettings();
    if (speedBroken && r !== 1) toast("Slower speeds aren't available for this programme");
    rateBadge.textContent = wantedRate() !== 1 ? formatRate(wantedRate()) : "";
    clearTimeout(speedTimer);
    speedTimer = window.setTimeout(applySpeed, SPEED_DELAY_MS);
  }

  function applyLayout(): void {
    const layout = pb && pb.isLive ? "off" : settings.layout;
    el.className = "screen player layout-" + layout + (stripOpen ? " strip-open" : "");
    el.style.setProperty("--sub-size", settings.fontSize + "px");
    if (media) media.relayout();
    dirty = true;
  }

  /* ------------------------------------------------------------ render */

  function lineEl(k: number, isCurrent: boolean, isActive: boolean): HTMLElement {
    const cue = cues[k];
    const mode = settings.displayMode;
    const tr = translator ? translator.out[k] : undefined;
    // While translation is failing, show plain original lines instead of "…" placeholders.
    const showTrans = translationWanted() && !(tr === undefined && translator && translator.failed);
    const row = h("div", {
      class: "line" + (isCurrent ? " current" : "") + (isActive ? " active" : "") + (k < lastIdx ? " past" : ""),
    });
    if (mode !== "translated" || !showTrans) row.appendChild(h("div", { class: "orig", text: cue.text }));
    if (showTrans) {
      row.appendChild(
        h("div", {
          class: "trans" + (tr === undefined ? " pending" : ""),
          dir: tr !== undefined && isRtl(settings.targetLang) ? "rtl" : null,
          text: tr === undefined ? (mode === "translated" ? cue.text : "…") : tr,
        })
      );
    }
    return row;
  }

  function renderPanel(idx: number, active: boolean): void {
    clear(panelTrack);
    panelTrack.style.webkitTransform = panelTrack.style.transform = "";
    if (!cues.length) {
      panelTrack.appendChild(h("div", { class: "line note", text: subtitleNote }));
      return;
    }
    const from = Math.max(0, idx - PAST);
    const to = Math.min(cues.length - 1, Math.max(idx, 0) + FUTURE);
    let current: HTMLElement | null = null;
    for (let k = from; k <= to; k++) {
      const row = lineEl(k, k === idx, k === idx && active);
      if (k === idx) current = row;
      panelTrack.appendChild(row);
    }
    // With large text the earlier lines can push the current one out of view; slide the list up.
    if (current) {
      const room = panelList.clientHeight;
      const shift = Math.max(0, current.offsetTop - Math.min(room * 0.3, Math.max(0, room - current.offsetHeight)));
      if (shift > 0) panelTrack.style.webkitTransform = panelTrack.style.transform = "translateY(-" + shift + "px)";
    }
  }

  function renderCaption(idx: number, active: boolean): void {
    if (!active || idx < 0) {
      caption.classList.remove("visible");
      return;
    }
    const tr = translator ? translator.out[idx] : undefined;
    const showTrans = translationWanted() && !(tr === undefined && translator && translator.failed);
    const mode = settings.displayMode;
    capOrig.textContent = mode !== "translated" || !showTrans ? cues[idx].text : "";
    capTrans.textContent = showTrans ? (tr === undefined ? (mode === "translated" ? cues[idx].text : "") : tr) : "";
    if (showTrans && tr !== undefined && isRtl(settings.targetLang)) capTrans.setAttribute("dir", "rtl");
    else capTrans.removeAttribute("dir");
    caption.classList.add("visible");
  }

  function renderHead(): void {
    if (!cues.length) {
      panelHead.textContent = pb && pb.isLive ? "Live TV" : "Subtitles";
      return;
    }
    let text = "Norsk";
    if (translationWanted()) {
      text += " → " + langName(settings.targetLang);
      if (translator) {
        if (translator.failed) text += " · translation unavailable";
        else {
          let done = 0;
          for (let i = 0; i < cues.length; i++) if (translator.out[i] !== undefined) done++;
          if (done < cues.length) text += ` · ${Math.floor((done / cues.length) * 100)}%`;
        }
        if (translator.provider === "deepl") text += " · DeepL";
        else if (translator.provider === "google") text += " · Google";
      }
    }
    panelHead.textContent = text;
  }

  function update(): void {
    if (destroyed) return;
    const t = curTime();
    const dur = media ? media.duration() : NaN;

    // OSD progress
    if (isFinite(dur) && dur > 0) {
      fill.style.width = Math.min(100, (t / dur) * 100) + "%";
      timeDur.textContent = formatTime(dur);
    } else {
      fill.style.width = "100%";
      timeDur.textContent = pb && pb.isLive ? "LIVE" : "";
    }
    timeCur.textContent = formatTime(t);
    playIcon.textContent = isPaused() ? "❚❚" : "▶";
    const controls = inControls();
    gearIcon.style.display = canOpenStrip() ? "" : "none";
    gearIcon.classList.toggle("on", controls && ctrl === "gear");
    playIcon.classList.toggle("on", controls && ctrl === "play");

    // Periodically remember where we are.
    if (kind === "program" && Date.now() - lastSave > 10000 && t > 0) {
      lastSave = Date.now();
      savePosition(id, t, dur);
    }

    const idx = cueIndexAt(cues, t);
    const active = idx >= 0 && t < cues[idx].end;
    if (idx !== lastIdx || active !== lastActive || dirty) {
      if (idx !== lastIdx && translator) translator.focusOn(Math.max(idx, 0));
      lastIdx = idx;
      lastActive = active;
      dirty = false;
      renderHead();
      if (settings.layout === "side") renderPanel(idx, active);
      else if (settings.layout === "bottom") renderCaption(idx, active);
    }
  }

  /* ----------------------------------------------------------- control */

  function showOsd(): void {
    osd.classList.add("visible");
    clearTimeout(osdTimer);
    osdTimer = window.setTimeout(() => {
      if (!isPaused()) osd.classList.remove("visible");
    }, OSD_MS);
  }

  function seekTo(t: number): void {
    if (!media) return;
    const d = media.duration();
    let max = isFinite(d) ? d - 0.5 : Infinity;
    let min = 0;
    const range = media.seekable();
    if (range) {
      min = range[0];
      max = Math.min(max, range[1]);
    }
    media.seek(Math.max(min, Math.min(max, t)));
    dirty = true;
    update();
  }

  function playSafe(): void {
    if (media) media.play();
  }

  function pauseMedia(): void {
    if (media) media.pause();
  }

  function canOpenStrip(): boolean {
    return !!media && !(pb && pb.isLive);
  }

  /** Paused: ◀ ▶ move between the ⚙ and ▶ buttons instead of seeking. */
  function inControls(): boolean {
    return isPaused() && canOpenStrip();
  }

  function togglePlay(): void {
    if (isPaused()) playSafe();
    else pauseMedia();
  }

  function stepCue(dir: -1 | 1): void {
    if (!cues.length) return;
    const t = curTime();
    const idx = cueIndexAt(cues, t);
    let target: number;
    if (dir < 0) {
      // Within the first 1.5 s of a line, jump to the previous one; otherwise restart this one.
      target = idx >= 0 && t - cues[idx].start > 1.5 ? idx : idx - 1;
    } else {
      target = idx + 1;
    }
    target = Math.max(0, Math.min(cues.length - 1, target));
    seekTo(cues[target].start + 0.05);
  }

  function repeatLine(): void {
    const idx = cueIndexAt(cues, curTime());
    if (idx >= 0) {
      seekTo(cues[idx].start + 0.05);
      if (isPaused()) playSafe();
    }
  }

  /* ------------------------------------------------------ options strip */

  function stripList(): StripItem[] {
    const items: StripItem[] = [
      {
        id: "speed",
        label: "Speed",
        value: () => (speedBroken ? "1× only" : formatRate(settings.playbackRate)),
        change: (dir) => {
          const i = SPEEDS.indexOf(settings.playbackRate);
          setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + dir))]);
        },
      },
      {
        id: "mode",
        label: "Subtitles",
        value: () => SHORT_MODE[settings.displayMode] || settings.displayMode,
        change: (dir) => {
          setDisplayMode(stepIn(DISPLAY_MODES.map((m) => m.code), settings.displayMode, dir));
          if (settings.targetLang === "off" && settings.displayMode !== "original") toast("Choose a translation language in Settings");
        },
      },
      {
        id: "layout",
        label: "Layout",
        value: () => SHORT_LAYOUT[settings.layout] || settings.layout,
        change: (dir) => setLayout(stepIn(LAYOUTS.map((l) => l.code), settings.layout, dir)),
      },
      {
        id: "size",
        label: "Text size",
        value: () => String(settings.fontSize),
        change: (dir) => {
          const i = FONT_SIZES.indexOf(settings.fontSize);
          setFontSize(FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, (i < 0 ? 0 : i) + dir))]);
        },
      },
    ];
    if (cues.length) items.push({ id: "repeat", label: "↺ Repeat line", run: repeatLine });
    items.push({
      id: "restart",
      label: "⏮ Start over",
      run: () => {
        seekTo(0);
        playSafe();
      },
    });
    return items;
  }

  function renderStrip(): void {
    const items = stripList();
    stripSel = Math.max(0, Math.min(items.length - 1, stripSel));
    clear(stripItems);
    items.forEach((it, i) => {
      const on = i === stripSel;
      const item = h("div", { class: "pstrip-item" + (on ? " on" : "") + (it.run ? " action" : "") });
      if (it.value) {
        item.appendChild(h("span", { class: "pstrip-label", text: it.label }));
        item.appendChild(h("span", { class: "pstrip-value", text: on ? "‹ " + it.value() + " ›" : it.value() }));
      } else {
        item.textContent = it.label;
      }
      stripItems.appendChild(item);
    });
  }

  function armStripIdle(): void {
    clearTimeout(stripTimer);
    stripTimer = window.setTimeout(closeStrip, STRIP_IDLE_MS);
  }

  function openStrip(): void {
    if (!canOpenStrip() || stripOpen) return;
    stripOpen = true;
    stripSel = 0;
    el.classList.add("strip-open");
    renderStrip();
    armStripIdle();
  }

  function closeStrip(): void {
    if (!stripOpen) return;
    stripOpen = false;
    clearTimeout(stripTimer);
    el.classList.remove("strip-open");
    showOsd();
  }

  function stripKey(key: Key, e: KeyboardEvent): boolean {
    armStripIdle();
    const items = stripList();
    const it = items[Math.max(0, Math.min(items.length - 1, stripSel))];
    switch (key) {
      case "left":
        stripSel = Math.max(0, stripSel - 1);
        renderStrip();
        return true;
      case "right":
        stripSel = Math.min(items.length - 1, stripSel + 1);
        renderStrip();
        return true;
      case "up":
      case "down":
        if (it.change) {
          it.change(key === "up" ? 1 : -1);
          renderStrip();
        }
        return true;
      case "enter":
        // Ignore the auto-repeat of the OK press that opened the strip.
        if (e.repeat) return true;
        if (it.change) {
          it.change(1);
          renderStrip();
        } else if (it.run) {
          closeStrip();
          it.run();
        }
        return true;
      case "back":
        closeStrip();
        return true;
      case "playpause":
        togglePlay();
        return true;
      case "play":
        playSafe();
        return true;
      case "pause":
        pauseMedia();
        return true;
      case "stop":
        pop();
        return true;
      default:
        return true;
    }
  }

  function setCtrl(c: "play" | "gear"): void {
    ctrl = c;
    update();
  }

  /* ---------------------------------------------------------------- keys */

  function onKey(key: Key, e: KeyboardEvent): boolean {
    if (stripOpen) return stripKey(key, e);
    showOsd();
    switch (key) {
      case "enter":
        if (e.repeat) return true;
        if (inControls() && ctrl === "gear") openStrip();
        else togglePlay();
        return true;
      case "playpause":
        togglePlay();
        return true;
      case "play":
        playSafe();
        return true;
      case "pause":
        pauseMedia();
        return true;
      case "left":
        if (inControls()) setCtrl("gear");
        else seekTo(curTime() - 10);
        return true;
      case "right":
        if (inControls()) setCtrl("play");
        else seekTo(curTime() + 10);
        return true;
      case "rw":
        seekTo(curTime() - 30);
        return true;
      case "ff":
        seekTo(curTime() + 30);
        return true;
      case "up":
        stepCue(-1);
        return true;
      case "down":
        stepCue(1);
        return true;
      // Colour keys: optional shortcuts for remotes that have them.
      case "yellow":
        repeatLine();
        return true;
      case "red":
        setDisplayMode(cycle(DISPLAY_MODES.map((m) => m.code), settings.displayMode));
        toast(DISPLAY_MODES.filter((m) => m.code === settings.displayMode)[0].name);
        return true;
      case "green":
        setLayout(cycle(LAYOUTS.map((l) => l.code), settings.layout));
        toast(LAYOUTS.filter((l) => l.code === settings.layout)[0].name);
        return true;
      case "blue":
        setFontSize(cycle(FONT_SIZES, settings.fontSize));
        toast("Text size " + settings.fontSize + " px");
        return true;
      case "stop":
        pop();
        return true;
      default:
        return false; // "back" → leave the player
    }
  }

  /* ------------------------------------------------------------- setup */

  function showStatus(message: string | null): void {
    clear(status);
    if (message === null) {
      status.style.display = "none";
      return;
    }
    status.style.display = "";
    status.appendChild(h("div", { class: "status error" }, h("span", { text: message })));
    status.appendChild(h("div", { class: "hint", text: "Press Back to return." }));
  }

  function showSpinner(): void {
    if (status.style.display === "none") {
      clear(status);
      status.appendChild(spinner(""));
      status.style.display = "";
    }
  }

  const events: MediaEvents = {
    onPlaying() {
      ctrl = "play";
      status.style.display = "none";
      setScreenSaver(false);
      showOsd();
    },
    onPause() {
      setScreenSaver(true);
      showOsd();
    },
    onWaiting: showSpinner,
    onReady() {
      if (resumeAt > 0) {
        const at = resumeAt;
        resumeAt = -1;
        const d = media ? media.duration() : NaN;
        if (!isFinite(d) || at < d - 5) {
          if (media) media.seek(at);
          if (resumeNotice) toast("Resuming from " + formatTime(at));
        }
      }
      resumeNotice = false;
    },
    onEnded() {
      setScreenSaver(true);
      osd.classList.add("visible");
    },
    onError(detail) {
      if (destroyed) return;
      failed[attempt] = true;
      // Try the next backend/stream, keeping the position.
      const t = curTime();
      if (t > 0 && kind === "program") resumeAt = t;
      if (speedSwitched) {
        // <video> doesn't work for this programme: back to AVPlay at 1×.
        speedBroken = true;
        toast("Slower speeds aren't available for this programme", 4000);
        const av = firstUsable("avplay");
        if (av >= 0) {
          speedSwitched = false;
          startAt(av, true);
          return;
        }
      }
      if (startNext()) return;
      showStatus(
        "The video could not be played" + (detail ? ` (${detail})` : "") +
          ". Many NRK programmes can only be watched from Norway."
      );
    },
  };

  function dropMedia(): void {
    dropStretch();
    if (!media) return;
    media.destroy();
    if (media.el.parentNode) media.el.parentNode.removeChild(media.el);
    media = null;
  }

  function startAt(i: number, autoplay: boolean): void {
    dropMedia();
    attempt = i;
    tried[i] = true;
    const c = candidates[i];
    media = c.backend === "avplay" ? createAvplayBackend(events) : createHtml5Backend(events);
    stage.insertBefore(media.el, stage.firstChild);
    applyLayout();
    showSpinner();
    media.open(c.stream.url);
    applySpeed();
    if (autoplay && media) media.play();
  }

  /** Start the first candidate that hasn't been tried yet. */
  function startNext(): boolean {
    if (wantedRate() !== 1 && audioSupported()) {
      // Slowed playback needs <video>; go there directly instead of via AVPlay.
      for (let i = 0; i < candidates.length; i++) {
        if (!tried[i] && candidates[i].backend === "html5") {
          speedSwitched = hasAvplay();
          startAt(i, true);
          return true;
        }
      }
    }
    speedSwitched = false;
    for (let i = 0; i < candidates.length; i++) {
      if (!tried[i]) {
        startAt(i, true);
        return true;
      }
    }
    dropMedia();
    return false;
  }

  applyLayout();
  renderPanel(-1, false);

  getPlayback(kind, id)
    .then((p) => {
      if (destroyed) return;
      pb = p;
      osdTitle.textContent = p.title || fallbackTitle;
      osdSub.textContent = p.subtitle;
      applyLayout();
      if (kind === "program") {
        const saved = loadPositions()[id];
        if (saved && saved > 30) {
          resumeAt = saved;
          resumeNotice = true;
        }
      }
      candidates = candidatesFor(p.streams);
      if (!startNext()) throw new NotPlayableError("This TV can't play the stream format NRK offers for this programme.");

      const track = pickSubtitleTrack(p.subtitles);
      if (!track) {
        subtitleNote = p.isLive ? "Live channels have no subtitle file." : "This programme has no subtitles.";
        dirty = true;
        return;
      }
      return loadCues(track).then((list) => {
        if (destroyed) return;
        cues = list;
        if (!cues.length) subtitleNote = "The subtitle file is empty.";
        ensureTranslator();
        dirty = true;
      });
    })
    .catch((err) => {
      if (destroyed) return;
      if (err instanceof NotPlayableError || !pb) {
        showStatus(err instanceof Error ? err.message : String(err));
      } else {
        subtitleNote = "Subtitles could not be loaded.";
        dirty = true;
      }
    });

  showOsd();

  return {
    el,
    onKey,
    destroy() {
      destroyed = true;
      clearInterval(tick);
      clearTimeout(osdTimer);
      clearTimeout(stripTimer);
      clearTimeout(speedTimer);
      dropStretch();
      if (translator) translator.stop();
      if (media) {
        const t = media.currentTime();
        if (kind === "program" && t > 0) savePosition(id, t, media.duration());
        media.destroy();
        media = null;
      }
      setScreenSaver(true);
    },
  };
}
