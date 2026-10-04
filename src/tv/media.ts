/**
 * Media backends for the player.
 *
 * On a Samsung TV, NRK serves on-demand programmes as DASH and live channels as
 * AES-128 HLS. Samsung's AVPlay handles both natively, so it is used whenever
 * `webapis.avplay` exists. Everywhere else (desktop preview) a plain HTML5
 * <video> element is used with the HLS stream.
 *
 * Slowed playback always uses <video>: AVPlay only knows whole-number speeds,
 * and both mute their own sound at any rate but 1, so the element is muted and
 * the player supplies the sound itself (see audio/stretch.ts).
 */

import { h } from "./dom";

export interface MediaEvents {
  onPlaying(): void;
  onPause(): void;
  onWaiting(): void;
  onReady(): void;
  onEnded(): void;
  onError(detail: string): void;
}

export interface MediaBackend {
  readonly name: "avplay" | "html5";
  readonly el: HTMLElement;
  open(url: string): void;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  /** Seconds. */
  currentTime(): number;
  /** Seconds, or NaN when unknown / live. */
  duration(): number;
  /** Seekable window in seconds, or null when unknown. */
  seekable(): [number, number] | null;
  seek(t: number): void;
  /** True while the picture is moving (not paused, seeking or buffering). */
  running(): boolean;
  /** HTML5 only: playback rate, optionally with the element's own sound muted. */
  setRate?(rate: number, muted: boolean): void;
  /** Keep the video plane aligned with `el` after layout changes. */
  relayout(): void;
  destroy(): void;
}

export function hasAvplay(): boolean {
  return !!(window.webapis && window.webapis.avplay);
}

/* ------------------------------------------------------------ HTML5 */

export function createHtml5Backend(ev: MediaEvents): MediaBackend {
  const video = h("video", { class: "video", preload: "auto" }) as HTMLVideoElement;
  let dead = false;
  let waiting = false;
  let rate = 1;

  // Loading a source resets playbackRate, and some TVs reset it on play.
  const applyRate = (): void => {
    if (video.playbackRate !== rate) video.playbackRate = rate;
  };
  video.addEventListener("playing", () => {
    waiting = false;
    applyRate();
    ev.onPlaying();
  });
  video.addEventListener("pause", () => ev.onPause());
  video.addEventListener("waiting", () => {
    waiting = true;
    ev.onWaiting();
  });
  video.addEventListener("seeked", () => {
    if (!video.paused) ev.onPlaying();
  });
  video.addEventListener("loadedmetadata", () => {
    applyRate();
    ev.onReady();
  });
  video.addEventListener("ended", () => ev.onEnded());
  video.addEventListener("error", () => {
    if (dead || !video.getAttribute("src")) return;
    ev.onError(video.error ? "error " + video.error.code : "");
  });

  return {
    name: "html5",
    el: video,
    open(url) {
      video.src = url;
    },
    play() {
      try {
        const p = video.play() as Promise<void> | undefined;
        if (p && typeof p.catch === "function") p.catch(() => undefined);
      } catch {
        // ignore
      }
    },
    pause() {
      video.pause();
    },
    isPaused() {
      return video.paused;
    },
    currentTime() {
      return video.currentTime || 0;
    },
    duration() {
      const d = video.duration;
      return isFinite(d) && d > 0 ? d : NaN;
    },
    seekable() {
      const s = video.seekable;
      return s && s.length ? [s.start(0), s.end(s.length - 1)] : null;
    },
    seek(t) {
      video.currentTime = t;
    },
    running() {
      return !video.paused && !video.seeking && !waiting && video.readyState >= 3;
    },
    setRate(r, muted) {
      rate = r;
      video.muted = muted;
      try {
        video.defaultPlaybackRate = r;
      } catch {
        // ignore
      }
      applyRate();
    },
    relayout() {
      // CSS handles it.
    },
    destroy() {
      dead = true;
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // ignore
      }
    },
  };
}

/* ----------------------------------------------------------- AVPlay */

export function createAvplayBackend(ev: MediaEvents): MediaBackend {
  const av = window.webapis!.avplay!;
  const obj = h("object", { class: "video", type: "application/avplayer" });
  let dead = false;
  let opened = false;
  let ready = false;
  let pendingPlay = false;
  let pendingSeek = -1;
  let timeMs = 0;
  let durationMs = 0;
  let pausedFlag = true;

  document.documentElement.classList.add("avplay");

  function state(): string {
    try {
      return av.getState();
    } catch {
      return "NONE";
    }
  }

  function setRect(): void {
    if (!opened) return;
    const r = obj.getBoundingClientRect();
    try {
      if (r.width > 0 && r.height > 0) av.setDisplayRect(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height));
    } catch {
      // ignore
    }
  }

  function doSeek(t: number): void {
    const ms = Math.max(0, Math.floor(t * 1000));
    timeMs = ms;
    try {
      av.seekTo(ms, () => undefined, () => undefined);
    } catch {
      // ignore
    }
  }

  function onVisibility(): void {
    if (!opened || dead) return;
    try {
      if (document.hidden) av.suspend();
      else {
        av.restore();
        setRect();
      }
    } catch {
      // ignore
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  const backend: MediaBackend = {
    name: "avplay",
    el: obj,
    open(url) {
      try {
        av.open(url);
        opened = true;
        av.setListener({
          onbufferingstart: () => {
            if (!dead) ev.onWaiting();
          },
          onbufferingcomplete: () => {
            if (!pausedFlag && !dead) ev.onPlaying();
          },
          oncurrentplaytime: (ms: number) => {
            timeMs = ms;
          },
          onstreamcompleted: () => {
            pausedFlag = true;
            ev.onEnded();
          },
          onerror: (e: unknown) => {
            if (!dead) ev.onError(String(e));
          },
        });
        try {
          av.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
        } catch {
          // Older firmware.
        }
        // Wait a frame so the <object> has its final layout box.
        window.setTimeout(setRect, 0);
        av.prepareAsync(
          () => {
            if (dead) return;
            ready = true;
            try {
              durationMs = av.getDuration() || 0;
            } catch {
              durationMs = 0;
            }
            ev.onReady();
            if (dead) return;
            if (pendingSeek >= 0) {
              doSeek(pendingSeek);
              pendingSeek = -1;
            }
            if (pendingPlay) backend.play();
          },
          (e: unknown) => {
            if (!dead) ev.onError(String(e));
          }
        );
      } catch (e) {
        ev.onError(e instanceof Error ? e.message : String(e));
      }
    },
    play() {
      if (dead) return;
      if (!ready) {
        pendingPlay = true;
        return;
      }
      try {
        av.play();
        pausedFlag = false;
        ev.onPlaying();
      } catch {
        // ignore
      }
    },
    pause() {
      pendingPlay = false;
      if (!ready) return;
      try {
        if (state() === "PLAYING") av.pause();
      } catch {
        // ignore
      }
      pausedFlag = true;
      ev.onPause();
    },
    isPaused() {
      return pausedFlag;
    },
    currentTime() {
      // oncurrentplaytime only fires a few times a second; ask for the exact time while playing.
      if (ready && !pausedFlag && !dead) {
        try {
          const ms = av.getCurrentTime();
          if (ms > 0) timeMs = ms;
        } catch {
          // keep the last reported time
        }
      }
      return timeMs / 1000;
    },
    duration() {
      return durationMs > 0 ? durationMs / 1000 : NaN;
    },
    seekable() {
      return durationMs > 0 ? [0, durationMs / 1000] : null;
    },
    running() {
      return !pausedFlag && state() === "PLAYING";
    },
    seek(t) {
      if (!ready) pendingSeek = t;
      else doSeek(t);
    },
    relayout() {
      setRect();
    },
    destroy() {
      dead = true;
      document.removeEventListener("visibilitychange", onVisibility);
      document.documentElement.classList.remove("avplay");
      try {
        av.stop();
      } catch {
        // ignore
      }
      try {
        av.close();
      } catch {
        // ignore
      }
    },
  };
  return backend;
}
