/**
 * NRK Subtitle Studio — content script
 *
 * Strategy:
 *  1. Locate the <video> element used by the NRK player (it appears asynchronously
 *     because tv.nrk.no is a SPA).
 *  2. Watch its `textTracks` list. As soon as a subtitle / caption track is added
 *     by the player, force `mode = 'hidden'` so the browser actually downloads
 *     and parses every cue (without changing what the user sees on the video).
 *  3. Snapshot all cues into memory and re-render a side overlay that "scrolls"
 *     with `video.currentTime` — past cues fade, the active cue is highlighted
 *     and upcoming cues stay visible so you can read ahead.
 *  4. Clicking a cue seeks the video to that timestamp.
 *
 * No build-time deps; this file is compiled to `dist/content.js` by `tsc`.
 */

(() => {
  if ((window as any).__nrkSubtitleStudioLoaded) return;
  (window as any).__nrkSubtitleStudioLoaded = true;

  interface State {
    video: HTMLVideoElement | null;
    track: TextTrack | null;
    cues: TextTrackCue[];
    lastActiveIndex: number;
  }

  const state: State = {
    video: null,
    track: null,
    cues: [],
    lastActiveIndex: -1,
  };

  // ---------- Overlay UI ----------

  const overlay = document.createElement("div");
  overlay.id = "nrk-sub-roller";
  const ICON_URL = (() => {
    try { return (chrome as any).runtime.getURL("public/icons/icon.svg"); }
    catch { return ""; }
  })();
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
  // The overlay is only inserted into the DOM on video pages — see mountIfNeeded().

  const listEl = overlay.querySelector(".nsr-list") as HTMLDivElement;
  const statusEl = overlay.querySelector(".nsr-status") as HTMLSpanElement;
  const bodyEl = overlay.querySelector(".nsr-body") as HTMLDivElement;

  // ---------- Fullscreen handling ----------
  // When the player goes fullscreen, only the fullscreen element's subtree is
  // rendered. Reparent the overlay into that element so it stays visible, and
  // restore it to <html> when leaving fullscreen.
  const overlayHome = document.documentElement;
  function syncFullscreenParent() {
    const fs = document.fullscreenElement as HTMLElement | null;
    const target = fs ?? overlayHome;
    if (overlay.parentElement !== target) {
      target.appendChild(overlay);
    }
  }
  document.addEventListener("fullscreenchange", syncFullscreenParent);
  // Safari / older WebKit
  document.addEventListener("webkitfullscreenchange", syncFullscreenParent as EventListener);

  let isExpanded = true;
  let savedExpandedHeight = "";

  // ---------- Font size ----------
  const FONT_KEY = "nsr.fontSize";
  const FONT_MIN = 10;
  const FONT_MAX = 32;
  const FONT_STEP = 2;
  let fontSize = clampFont(parseInt(localStorage.getItem(FONT_KEY) || "13", 10) || 13);
  function clampFont(n: number) { return Math.max(FONT_MIN, Math.min(FONT_MAX, n)); }
  function applyFontSize() {
    overlay.style.setProperty("--nsr-cue-size", fontSize + "px");
    try { localStorage.setItem(FONT_KEY, String(fontSize)); } catch { /* ignore */ }
  }
  applyFontSize();

  // ---------- Window size (persisted) ----------
  const SIZE_KEY = "nsr.size";
  function loadSize(): { w: number; h: number } | null {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (typeof o?.w === "number" && typeof o?.h === "number") return o;
    } catch { /* ignore */ }
    return null;
  }
  const savedSize = loadSize();
  if (savedSize) {
    overlay.style.width = savedSize.w + "px";
    overlay.style.height = savedSize.h + "px";
  }
  // Persist whenever the user drags the bottom-right resize handle.
  // Skip persistence while the window is collapsed (we set height to auto then,
  // and we don't want to overwrite the user's preferred expanded height).
  let resizeSaveTimer: number | null = null;
  let suppressSizeSave = false;
  const ro = new ResizeObserver(() => {
    if (suppressSizeSave) return;
    if (resizeSaveTimer !== null) return;
    resizeSaveTimer = self.setTimeout(() => {
      resizeSaveTimer = null;
      if (suppressSizeSave) return;
      const r = overlay.getBoundingClientRect();
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify({
          w: Math.round(r.width),
          h: Math.round(r.height),
        }));
      } catch { /* ignore */ }
    }, 150);
  });
  ro.observe(overlay);

  // ---------- Playback speed (persisted) ----------
  const SPEED_KEY = "nsr.playbackRate";
  const SPEED_MIN = 0.25;
  const SPEED_MAX = 4;
  let playbackRate = clampSpeed(parseFloat(localStorage.getItem(SPEED_KEY) || "1") || 1);
  function clampSpeed(n: number) { return Math.max(SPEED_MIN, Math.min(SPEED_MAX, n)); }
  const speedSel = overlay.querySelector('select[data-act="speed"]') as HTMLSelectElement;
  // Use the closest preset; if the saved rate isn't in the list, the select
  // just shows nothing — that's fine.
  speedSel.value = String(playbackRate);
  function applyPlaybackRate() {
    if (state.video) {
      try { state.video.playbackRate = playbackRate; } catch { /* ignore */ }
    }
    try { localStorage.setItem(SPEED_KEY, String(playbackRate)); } catch { /* ignore */ }
  }
  speedSel.addEventListener("change", () => {
    playbackRate = clampSpeed(parseFloat(speedSel.value) || 1);
    applyPlaybackRate();
  });

  // ---------- Custom resize from any edge / corner ----------
  // Native CSS `resize` only offers a single bottom-right grip. We render 8
  // invisible handles around the overlay (4 edges + 4 corners) and translate
  // mouse drags into width/height/top/left changes.
  const MIN_W = 240;
  const MIN_H = 140;

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
        if (w < MIN_W) {
          if (dir.includes("w")) left -= MIN_W - w;
          w = MIN_W;
        }
        if (w > maxW) {
          if (dir.includes("w")) left += w - maxW;
          w = maxW;
        }
        // Clamp height
        if (h < MIN_H) {
          if (dir.includes("n")) top -= MIN_H - h;
          h = MIN_H;
        }
        if (h > maxH) {
          if (dir.includes("n")) top += h - maxH;
          h = maxH;
        }
        // Keep on screen
        if (left < 0) { w += left; left = 0; }
        if (top < 0)  { h += top;  top  = 0; }
        if (left + w > window.innerWidth)  w = window.innerWidth  - left;
        if (top  + h > window.innerHeight) h = window.innerHeight - top;

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
        // ResizeObserver above already persists the new size.
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });

  // ---------- Translation settings ----------
  const TARGET_KEY = "nsr.targetLang";
  const MODE_KEY = "nsr.displayMode";
  type DisplayMode = "original" | "translated" | "bilingual";

  // Curated target list (BCP-47 base codes). "off" means no translation.
  const LANGS: { code: string; name: string }[] = [
    { code: "off", name: "— No translation —" },
    { code: "en", name: "English" },
    { code: "sv", name: "Svenska" },
    { code: "da", name: "Dansk" },
    { code: "de", name: "Deutsch" },
    { code: "fr", name: "Français" },
    { code: "es", name: "Español" },
    { code: "it", name: "Italiano" },
    { code: "nl", name: "Nederlands" },
    { code: "pl", name: "Polski" },
    { code: "pt", name: "Português" },
    { code: "ru", name: "Русский" },
    { code: "tr", name: "Türkçe" },
    { code: "ar", name: "العربية" },
    { code: "fa", name: "فارسی" },
    { code: "hi", name: "हिन्दी" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "zh", name: "中文" },
  ];

  let targetLang = localStorage.getItem(TARGET_KEY) || "off";
  let displayMode: DisplayMode =
    (localStorage.getItem(MODE_KEY) as DisplayMode) || "bilingual";

  const langSel = overlay.querySelector('select[data-act="lang"]') as HTMLSelectElement;
  const modeSel = overlay.querySelector('select[data-act="mode"]') as HTMLSelectElement;
  langSel.innerHTML = LANGS.map(
    (l) => `<option value="${l.code}">${l.name}</option>`
  ).join("");
  langSel.value = targetLang;
  modeSel.value = displayMode;
  function syncModeSelVisibility() {
    modeSel.style.display = targetLang === "off" ? "none" : "";
  }
  function syncLangSelVisibility() {
    // No need to pick a target language if the user only wants the original.
    langSel.style.display = displayMode === "original" ? "none" : "";
  }
  syncModeSelVisibility();
  syncLangSelVisibility();

  langSel.addEventListener("change", () => {
    targetLang = langSel.value;
    try { localStorage.setItem(TARGET_KEY, targetLang); } catch { /* ignore */ }
    syncModeSelVisibility();
    onTranslationConfigChanged();
  });
  modeSel.addEventListener("change", () => {
    displayMode = modeSel.value as DisplayMode;
    try { localStorage.setItem(MODE_KEY, displayMode); } catch { /* ignore */ }
    syncLangSelVisibility();
    updateStatus();
    invalidateRender();
    render();
  });

  // ---------- Translation engine (Google Translate, public gtx endpoint) ----------
  // Uses the same unauthenticated endpoint that Chrome's built-in
  // "Translate this page" feature uses. No API key required, but it is
  // technically unofficial — Google may rate-limit or change it.
  type TrState = "pending" | "done" | "error";
  const translations = new Map<number, { state: TrState; text: string }>();

  // Cache so identical lines aren't re-translated, and survive seeks.
  const trCache = new Map<string, string>();

  let translatorRequestId = 0;            // bumped on config change
  const REQ_DELAY_MS = 50;                // gap between batch requests
  let lastReqAt = 0;

  function detectSourceLang(): string {
    const lang = (state.track?.language || "").toLowerCase();
    if (lang) return lang.split("-")[0] || lang;
    return "no"; // NRK content is Norwegian by default
  }

  async function googleTranslate(
    text: string,
    source: string,
    target: string
  ): Promise<string> {
    // The page's CSP blocks direct fetches to translate.googleapis.com from a
    // content script, so we proxy through the extension's background service
    // worker (not subject to page CSP).
    return new Promise((resolve, reject) => {
      try {
        (chrome as any).runtime.sendMessage(
          { type: "translate", text, source: source || "auto", target },
          (resp: any) => {
            const err = (chrome as any).runtime.lastError;
            if (err) return reject(new Error(err.message || "runtime error"));
            if (!resp || !resp.ok) {
              return reject(new Error((resp && resp.error) || "translate failed"));
            }
            resolve(String(resp.text || ""));
          }
        );
      } catch (e: any) {
        reject(e);
      }
    });
  }

  // ---------- Coalesced batch translator ----------
  // Each render() asks for translations of the visible cues. Instead of
  // sending one HTTP request per cue, we collect all requested indices for a
  // short coalescing window (~30 ms) and send them as a single Google
  // Translate request. The active cue then arrives in one round-trip with the
  // rest of the visible window, instead of waiting behind N requests.

  const SEPARATOR = "\n\n@@@\n\n"; // unlikely to appear in subtitles; survives translation
  const COALESCE_MS = 30;

  const trPending = new Set<number>(); // indices waiting to be batched
  let flushTimer: number | null = null;
  let batchInflight = false;

  function enqueueTranslate(idx: number, _priority: boolean) {
    if (targetLang === "off" || displayMode === "original") return;
    if (idx < 0 || idx >= state.cues.length) return;

    const existing = translations.get(idx);
    if (existing && (existing.state === "done" || existing.state === "pending" || existing.state === "error")) return;

    // Cache hit?
    const cue = state.cues[idx] as VTTCue;
    const raw = (cue.text || "").replace(/<[^>]+>/g, "");
    const norm = raw.replace(/\s+/g, " ").trim();
    if (!norm) {
      translations.set(idx, { state: "done", text: "" });
      invalidateRender();
      return;
    }
    const cacheKey = `${detectSourceLang()}|${targetLang}|${norm}`;
    const cached = trCache.get(cacheKey);
    if (cached !== undefined) {
      translations.set(idx, { state: "done", text: cached });
      invalidateRender();
      return;
    }

    translations.set(idx, { state: "pending", text: "" });
    trPending.add(idx);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = self.setTimeout(() => {
      flushTimer = null;
      void flushBatch();
    }, COALESCE_MS);
  }

  async function flushBatch() {
    if (batchInflight) {
      // A batch is already in flight; we'll re-flush after it completes.
      return;
    }
    if (trPending.size === 0) return;

    // Pace requests
    const wait = REQ_DELAY_MS - (Date.now() - lastReqAt);
    if (wait > 0) {
      self.setTimeout(() => void flushBatch(), wait);
      return;
    }

    // Snapshot the pending set, sorted by playback order (active cue first
    // in the joined string is fine — but ordering helps debugging).
    const indices = Array.from(trPending).sort((a, b) => a - b);
    trPending.clear();

    const myReq = translatorRequestId;
    const source = detectSourceLang();
    const target = targetLang;
    const lines: string[] = [];
    const norms: string[] = [];
    for (const i of indices) {
      const cue = state.cues[i] as VTTCue | undefined;
      const raw = cue ? (cue.text || "").replace(/<[^>]+>/g, "") : "";
      lines.push(raw);
      norms.push(raw.replace(/\s+/g, " ").trim());
    }
    const joined = lines.join(SEPARATOR);

    batchInflight = true;
    lastReqAt = Date.now();
    try {
      const out = await googleTranslate(joined, source, target);
      if (myReq !== translatorRequestId) return;

      // Try to split the translated text the same way we joined it.
      const parts = splitTranslated(out, indices.length);

      if (parts.length === indices.length) {
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k];
          const text = parts[k].trim();
          translations.set(i, { state: "done", text });
          if (norms[k]) trCache.set(`${source}|${target}|${norms[k]}`, text);
        }
      } else {
        // Separator was lost in translation. Fall back to per-cue requests
        // (still serialized through this same flush mechanism).
        console.warn("[nsr] batch split mismatch, expected", indices.length, "got", parts.length);
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k];
          if (myReq !== translatorRequestId) return;
          try {
            const t1 = await googleTranslate(lines[k], source, target);
            translations.set(i, { state: "done", text: t1 });
            if (norms[k]) trCache.set(`${source}|${target}|${norms[k]}`, t1);
          } catch {
            translations.set(i, { state: "error", text: "" });
          }
          invalidateRender();
        }
      }
    } catch (e) {
      console.warn("[nsr] batch translate failed", e);
      for (const i of indices) translations.set(i, { state: "error", text: "" });
      // Brief back-off on (likely) 429.
      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      batchInflight = false;
      invalidateRender();
      render();
      // If more cues were enqueued while we were waiting, flush again.
      if (trPending.size > 0) scheduleFlush();
    }
  }

  function splitTranslated(text: string, expected: number): string[] {
    // The exact `\n\n@@@\n\n` may come back with whitespace shifts.
    // Try a forgiving regex first.
    const re = /\s*@@@\s*/g;
    const parts = text.split(re);
    if (parts.length === expected) return parts;
    // Some translators produce localized "@" or wrap them. Fall back to
    // splitting by double newline as a last resort.
    if (expected === 1) return [text];
    return parts;
  }

  function onTranslationConfigChanged() {
    translatorRequestId++;
    translations.clear();
    trPending.clear();
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    invalidateRender();
    // Stable status — set once here, never per-cue, so the toolbar doesn't
    // flicker as cues enter/leave the visible window.
    updateStatus();
    render();
    // No bulk prefetch — render() will enqueue the active cue and the next
    // few visible cues on demand.
  }

  function updateStatus() {
    if (displayMode === "original" || targetLang === "off") {
      setStatus(state.track?.language || state.track?.label || "");
    } else {
      setStatus(`${detectSourceLang()} → ${targetLang}`);
    }
  }

  function invalidateRender() {
    (listEl as any).__nsrSig = null;
  }

  overlay.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.dataset.act;
    if (act === "toggle") {
      const collapsed = bodyEl.style.display === "none";
      bodyEl.style.display = collapsed ? "" : "none";
      const nowCollapsed = !collapsed;
      isExpanded = !nowCollapsed;
      // Shrink the overlay window itself to header-only when collapsed,
      // and restore the previous height when re-expanded.
      if (nowCollapsed) {
        savedExpandedHeight = overlay.style.height || overlay.getBoundingClientRect().height + "px";
        suppressSizeSave = true;
        overlay.style.height = "auto";
        overlay.style.minHeight = "0";
      } else {
        overlay.style.height = savedExpandedHeight || "";
        overlay.style.minHeight = "";
        // Allow size persistence again after the layout settles.
        self.setTimeout(() => { suppressSizeSave = false; }, 200);
      }
      t.textContent = nowCollapsed ? "Show" : "Hide";
      t.title = nowCollapsed ? "Show subtitle list" : "Hide subtitle list";
      applyNativeSubtitleVisibility();
    } else if (act === "font-up") {
      fontSize = clampFont(fontSize + FONT_STEP);
      applyFontSize();
    } else if (act === "font-down") {
      fontSize = clampFont(fontSize - FONT_STEP);
      applyFontSize();
    }
  });

  makeDraggable(overlay, overlay.querySelector(".nsr-header") as HTMLElement);

  function makeDraggable(el: HTMLElement, handle: HTMLElement) {
    let dragging = false;
    let sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener("mousedown", (e: MouseEvent) => {
      // Don't drag when clicking interactive controls
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

  // ---------- Video / track discovery ----------

  function findVideo(): HTMLVideoElement | null {
    // NRK uses a single <video> in their player.
    const list = document.querySelectorAll("video");
    for (const v of Array.from(list)) {
      if (v.duration > 0 || v.readyState > 0 || v.src || v.currentSrc) return v;
    }
    return list[0] ?? null;
  }

  function attachToVideo(video: HTMLVideoElement) {
    if (state.video === video) return;
    state.video = video;
    state.cues = [];
    state.track = null;
    state.lastActiveIndex = -1;
    setStatus("video found");

    const refresh = () => scanTextTracks(video);
    video.textTracks.addEventListener("addtrack", refresh);
    video.textTracks.addEventListener("removetrack", refresh);
    video.addEventListener("timeupdate", render);
    video.addEventListener("seeked", () => { state.lastActiveIndex = -1; render(); });
    video.addEventListener("loadedmetadata", refresh);
    // Re-apply our chosen playback rate if the player resets it.
    video.addEventListener("ratechange", () => {
      if (Math.abs(video.playbackRate - playbackRate) > 0.001) {
        try { video.playbackRate = playbackRate; } catch { /* ignore */ }
      }
    });
    // Apply now
    applyPlaybackRate();

    refresh();
  }

  function scanTextTracks(video: HTMLVideoElement) {
    const tracks = video.textTracks;
    let bestTrack: TextTrack | null = null;
    let bestCount = 0;

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t.kind !== "subtitles" && t.kind !== "captions") continue;

      // (1) Always make sure cues get parsed: 'disabled' → 'hidden'.
      if (t.mode === "disabled") {
        try { t.mode = "hidden"; } catch { /* ignore */ }
      }

      // (2) While our overlay is expanded, hide NRK's native rendering by
      // flipping any 'showing' track to 'hidden'. Mark it so we know to
      // restore it when the user collapses the overlay.
      if (isExpanded && t.mode === "showing") {
        (t as any).__nsrOverridden = true;
        try { t.mode = "hidden"; } catch { /* ignore */ }
      }

      // Hook each track once
      const tagged = (t as any).__nsrHooked;
      if (!tagged) {
        (t as any).__nsrHooked = true;
        t.addEventListener("cuechange", () => snapshotCues(t));
        // Some players add cues asynchronously after first load
        t.addEventListener("load" as any, () => snapshotCues(t));
      }

      const count = t.cues ? t.cues.length : 0;
      if (count > bestCount) {
        bestCount = count;
        bestTrack = t;
      }
    }

    if (bestTrack && bestCount > 0) snapshotCues(bestTrack);
    else setStatus(`no cues yet (${tracks.length} track${tracks.length === 1 ? "" : "s"} found)`);
  }

  function snapshotCues(track: TextTrack) {
    if (!track.cues) return;
    const cues = Array.from(track.cues);
    if (cues.length <= state.cues.length && state.track === track) return;
    const trackChanged = state.track !== track;
    state.track = track;
    state.cues = cues;
    if (targetLang === "off") {
      setStatus(track.language || track.label || "");
    } else if (displayMode === "original") {
      setStatus(track.language || track.label || "");
    } else {
      setStatus(`${detectSourceLang()} → ${targetLang}`);
    }
    if (trackChanged) {
      // New source language → translations from the old track no longer apply.
      onTranslationConfigChanged();
    }
    // No prefetch: render() enqueues the visible window only.
    render();
  }

  function setStatus(s: string) {
    statusEl.textContent = s;
  }

  // Apply expand/collapse policy to native track rendering immediately.
  // - Expanded:  any 'showing' subtitle track is flipped to 'hidden'
  //              (the periodic scan also enforces this).
  // - Collapsed: any track we previously hid is forced back to 'showing'
  //              so NRK's native subtitles reappear over the video.
  function applyNativeSubtitleVisibility() {
    if (!state.video) return;
    const tracks = state.video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t.kind !== "subtitles" && t.kind !== "captions") continue;
      if (isExpanded) {
        if (t.mode === "showing") {
          (t as any).__nsrOverridden = true;
          try { t.mode = "hidden"; } catch { /* ignore */ }
        }
      } else {
        if ((t as any).__nsrOverridden) {
          try { t.mode = "showing"; } catch { /* ignore */ }
          delete (t as any).__nsrOverridden;
        }
      }
    }
    // Collapsed → restore any DOM elements we hid.
    if (!isExpanded) restoreHiddenNativeDom();
  }

  // ---------- DOM-rendered subtitle hider ----------
  // NRK's player paints subtitles using its own DOM nodes (not the native
  // ::cue renderer), so flipping `track.mode` alone doesn't hide them.
  // Strategy: while expanded, find the player's container, look for elements
  // whose visible text matches the current cue, and `visibility: hidden`
  // them. Restore on collapse / when the cue changes.

  const hiddenDomEls = new Set<HTMLElement>();

  function findPlayerContainer(video: HTMLVideoElement): HTMLElement {
    // Walk up to the largest ancestor that is still ~the size of the video
    // (and not the whole page) — that's typically the player root.
    let el: HTMLElement | null = video.parentElement;
    let best: HTMLElement | null = el;
    const vw = video.clientWidth || 1;
    while (el && el !== document.body && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      // Stop once we've grown well beyond the video's footprint.
      if (r.width > vw * 4) break;
      best = el;
      el = el.parentElement;
    }
    return best || video.parentElement || document.body;
  }

  function normalize(s: string): string {
    return s.replace(/\s+/g, " ").trim();
  }

  function restoreHiddenNativeDom() {
    hiddenDomEls.forEach((el) => {
      el.style.visibility = "";
    });
    hiddenDomEls.clear();
  }

  function hideNativeDomSubtitles(cue: VTTCue | null, t: number) {
    // Always start by restoring whatever we hid last frame.
    restoreHiddenNativeDom();

    if (!isExpanded || !state.video || !cue) return;

    // Native renderer would only be drawing if the cue overlaps current time.
    if (t < cue.startTime || t > cue.endTime) return;

    const raw = (cue.text || "").replace(/<[^>]+>/g, "");
    const lines = raw.split(/\n+/).map(normalize).filter((l) => l.length >= 2);
    if (!lines.length) return;
    const joined = normalize(raw.replace(/\n+/g, " "));

    const root = findPlayerContainer(state.video);

    // Walk descendants; only hide leaf-ish text nodes, never our own overlay
    // and never interactive controls.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        if (el.closest("#nrk-sub-roller")) return NodeFilter.FILTER_REJECT;
        const tag = el.tagName;
        if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as HTMLElement;
      // Only consider elements with shallow text (likely a subtitle line, not
      // an entire panel).
      if (el.childElementCount > 4) continue;
      const txt = normalize(el.textContent || "");
      if (!txt || txt.length > joined.length + 80) continue;

      const matches =
        txt === joined ||
        lines.some((l) => txt === l) ||
        // Some renderers wrap each line in its own element AND also have a
        // wrapper containing both lines glued together with a space.
        (lines.length > 1 && txt === lines.join(" "));

      if (matches) {
        if (el.style.visibility !== "hidden") {
          el.style.visibility = "hidden";
        }
        hiddenDomEls.add(el);
      }
    }
  }

  // ---------- Rolling render ----------

  function fmtTime(s: number): string {
    if (!isFinite(s)) return "--:--";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = Math.floor(s % 60);
    const mm = m.toString().padStart(2, "0");
    const rr = r.toString().padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${rr}` : `${m}:${rr}`;
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]
    );
  }

  function render() {
    if (!state.cues.length) {
      listEl.innerHTML = `<div class="nsr-empty">Waiting for subtitles…<br/>
        Open the NRK player's CC/subtitle menu and select a language —
        every cue will then be loaded and rolled here.</div>`;
      return;
    }

    const t = state.video?.currentTime ?? 0;

    // Binary search: index of last cue with startTime <= t
    let lo = 0, hi = state.cues.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (state.cues[mid].startTime <= t) { idx = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }

    // Active cue: the most recent cue whose startTime <= t.
    // It stays "active" through the silent gap until the NEXT cue starts,
    // so the current line never disappears between subtitles.
    const active = idx;

    // Hide NRK's DOM-rendered subtitle (if any) for the active cue.
    // This must run on every render — not gated by the window-change cache.
    hideNativeDomSubtitles(active >= 0 ? (state.cues[active] as VTTCue) : null, t);

    // Roll window: a couple of past, several upcoming
    const PAST = 3;
    const FUTURE = 12;
    const anchor = active >= 0 ? active : Math.max(0, idx + 1);
    const start = Math.max(0, anchor - PAST);
    const end = Math.min(state.cues.length, anchor + FUTURE);

    // Re-render only when window, active state, or the visible-window
    // translation states change.
    let trSig = "";
    if (targetLang !== "off" && displayMode !== "original") {
      for (let i = start; i < end; i++) {
        const tr = translations.get(i);
        trSig += tr ? (tr.state === "done" ? "d" : tr.state === "error" ? "e" : "p") : "_";
      }
    }
    const sig = `${start}|${end}|${active}|${targetLang}|${displayMode}|${trSig}`;
    if ((listEl as any).__nsrSig === sig) return;
    (listEl as any).__nsrSig = sig;

    const parts: string[] = [];
    for (let i = start; i < end; i++) {
      const c = state.cues[i] as VTTCue;
      // A cue is "past" only once the NEXT cue has started (or, for the last
      // cue, once its own endTime has passed). This keeps the current line
      // highlighted through silent gaps between subtitles.
      const next = state.cues[i + 1] as VTTCue | undefined;
      const isPast = next ? next.startTime <= t : c.endTime < t;
      const cls =
        i === active ? "nsr-cue nsr-active" :
        isPast ? "nsr-cue nsr-past" :
        "nsr-cue nsr-future";
      const original = escapeHtml((c.text || "").replace(/<[^>]+>/g, "")).replace(/\n/g, "<br/>");

      let inner = "";
      if (targetLang === "off" || displayMode === "original") {
        inner = `<span class="nsr-orig">${original}</span>`;
      } else {
        // Visible cues get high-priority translation.
        enqueueTranslate(i, /* priority */ true);
        const tr = translations.get(i);
        const translatedHtml =
          tr?.state === "done"
            ? escapeHtml(tr.text).replace(/\n/g, "<br/>")
            : tr?.state === "error"
            ? `<span class="nsr-warn" title="Translation failed (click cue to retry by changing language)">⚠</span>`
            : `<span class="nsr-pending">…</span>`;
        if (displayMode === "translated") {
          inner = `<span class="nsr-trans">${translatedHtml}</span>`;
        } else {
          // bilingual
          inner =
            `<span class="nsr-orig">${original}</span>` +
            `<span class="nsr-trans">${translatedHtml}</span>`;
        }
      }

      parts.push(
        `<div class="${cls}" data-start="${c.startTime}">
           <span class="nsr-t">${fmtTime(c.startTime)}</span>
           <span class="nsr-x">${inner}</span>
         </div>`
      );
    }
    listEl.innerHTML = parts.join("");

    const activeEl = listEl.querySelector(".nsr-active") as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  // Click-to-seek
  listEl.addEventListener("click", (e) => {
    const cueEl = (e.target as HTMLElement).closest(".nsr-cue") as HTMLElement | null;
    if (!cueEl || !state.video) return;
    const s = parseFloat(cueEl.dataset.start || "0");
    if (!isNaN(s)) state.video.currentTime = s;
  });

  // ---------- SPA / DOM watching + URL gating ----------

  // Only run on actual video pages, not the tv.nrk.no main / category pages.
  // tv.nrk.no video URLs typically contain one of these path segments.
  function isVideoPage(): boolean {
    return /\/(episode|program|direkte|film|se)(\/|$)/.test(location.pathname);
  }

  let mounted = false;

  function mountIfNeeded() {
    const should = isVideoPage();
    if (should && !mounted) {
      document.documentElement.appendChild(overlay);
      syncFullscreenParent(); // in case we entered fullscreen on the new page
      mounted = true;
      // Try to grab the video right away.
      const v = findVideo();
      if (v) attachToVideo(v);
    } else if (!should && mounted) {
      // Leaving a video page → tear everything down.
      restoreHiddenNativeDom();
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      // Clear translation state and inflight work
      translatorRequestId++;
      translations.clear();
      trPending.clear();
      if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
      // Reset video / cues so attachToVideo() runs fresh next time
      state.video = null;
      state.track = null;
      state.cues = [];
      state.lastActiveIndex = -1;
      mounted = false;
    }
  }

  // Detect SPA navigations: NRK uses the History API.
  (function patchHistory() {
    const fire = () => queueMicrotask(mountIfNeeded);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (this: History, ...args: any[]) {
      const r = origPush.apply(this, args as any);
      fire();
      return r;
    } as typeof history.pushState;
    history.replaceState = function (this: History, ...args: any[]) {
      const r = origReplace.apply(this, args as any);
      fire();
      return r;
    } as typeof history.replaceState;
    window.addEventListener("popstate", fire);
    window.addEventListener("hashchange", fire);
  })();

  const mo = new MutationObserver(() => {
    if (!mounted) return;
    const v = findVideo();
    if (v && v !== state.video) attachToVideo(v);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Periodic tick: re-evaluate URL, re-scan tracks, re-attach if needed.
  setInterval(() => {
    mountIfNeeded();
    if (!mounted) return;
    if (!state.video || !document.contains(state.video)) {
      const v = findVideo();
      if (v) attachToVideo(v);
      return;
    }
    scanTextTracks(state.video);
  }, 1500);

  // Initial check
  mountIfNeeded();
})();

