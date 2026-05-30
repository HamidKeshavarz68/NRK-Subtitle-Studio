/**
 * Video / text-track discovery and cue capture.
 *
 * tv.nrk.no is a SPA, so the <video> appears asynchronously and can be swapped
 * across navigations. We attach listeners (cleanly detachable), force subtitle
 * tracks to `hidden` so the browser parses every cue, and snapshot cues into
 * shared state whenever they grow.
 */

import { applyPlaybackRate, settings, state } from "./state";
import { isSubtitleTrack } from "./utils";
import { render, setStatus, updateStatus, invalidateRender } from "./renderer";
import { onTranslationConfigChanged, stopTranslations } from "./translator";

/** Marker so each track is hooked for cue updates only once. */
const HOOKED = "__nsrHooked";

let detach: (() => void) | null = null;

/**
 * Signature of the last snapshotted cue set. The player streams subtitles in
 * segments and evicts cues outside the back-buffer, so the cue count is NOT
 * monotonic — it can stay the same or shrink while the actual cues change. We
 * therefore track a content signature (count + boundary timestamps) instead of
 * relying on length alone to decide whether the snapshot is stale.
 */
let lastCueSig = "";

/**
 * Start time of the first cue in the last snapshot. The per-cue translation map
 * is keyed by index; if the player evicts cues from the front, indices shift and
 * those mappings would point at the wrong cue. We detect a front shift via this
 * timestamp and reset the (content-cached) translation state so it rehydrates
 * against the correct cues.
 */
let lastFirstStart = -1;

export function findVideo(): HTMLVideoElement | null {
  // NRK uses a single <video> in their player.
  const list = document.querySelectorAll("video");
  for (const v of Array.from(list)) {
    if (v.duration > 0 || v.readyState > 0 || v.src || v.currentSrc) return v;
  }
  return list[0] ?? null;
}

export function attachToVideo(video: HTMLVideoElement): void {
  if (state.video === video) return;
  detachVideo();

  state.video = video;
  state.cues = [];
  state.track = null;
  lastCueSig = "";
  lastFirstStart = -1;
  setStatus("video found");

  const refresh = () => scanTextTracks(video);
  const onSeeked = () => render();
  // On every tick, cheaply re-sync the active track's cues (signature-guarded so
  // it's a no-op when nothing changed) then render. This recovers even if a
  // `cuechange` event is missed when the player evicts/replaces buffered cues.
  const onTimeUpdate = () => {
    if (state.track) snapshotCues(state.track);
    render();
  };
  const onRateChange = () => {
    if (Math.abs(video.playbackRate - settings.playbackRate) > 0.001) {
      try { video.playbackRate = settings.playbackRate; } catch { /* ignore */ }
    }
  };

  video.textTracks.addEventListener("addtrack", refresh);
  video.textTracks.addEventListener("removetrack", refresh);
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("loadedmetadata", refresh);
  // Re-apply our chosen playback rate if the player resets it.
  video.addEventListener("ratechange", onRateChange);

  detach = () => {
    video.textTracks.removeEventListener("addtrack", refresh);
    video.textTracks.removeEventListener("removetrack", refresh);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("loadedmetadata", refresh);
    video.removeEventListener("ratechange", onRateChange);
  };

  applyPlaybackRate();
  refresh();
}

/** Remove listeners from the currently attached video, if any. */
export function detachVideo(): void {
  if (detach) {
    detach();
    detach = null;
  }
}

export function scanTextTracks(video: HTMLVideoElement): void {
  const tracks = video.textTracks;
  let bestTrack: TextTrack | null = null;
  let bestCount = 0;

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!isSubtitleTrack(t)) continue;

    // We deliberately do NOT change t.mode here. The player only streams
    // subtitle segments while the track is visible/showing, so forcing it to
    // 'hidden' would stop cue loading. Native captions are suppressed visually
    // instead (see native-subtitles.ts).

    // Hook each track once.
    if (!(t as any)[HOOKED]) {
      (t as any)[HOOKED] = true;
      t.addEventListener("cuechange", () => snapshotCues(t));
      // Some players add cues asynchronously after first load.
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

/** Cheap fingerprint of a cue set: count plus the boundary timestamps. */
function cueSetSignature(cues: TextTrackCue[]): string {
  const n = cues.length;
  if (n === 0) return "0";
  return `${n}|${cues[0].startTime}|${cues[n - 1].startTime}|${cues[n - 1].endTime}`;
}

function snapshotCues(track: TextTrack): void {
  if (!track.cues) return;
  const cues = Array.from(track.cues);
  const sig = cueSetSignature(cues);
  const trackChanged = state.track !== track;
  // Skip only when the same track's cue *content* is unchanged. Comparing a
  // signature (not just length) catches segment eviction/replacement, where the
  // count is unchanged but the cues themselves have rolled forward.
  if (!trackChanged && sig === lastCueSig) return;

  lastCueSig = sig;
  state.track = track;
  state.cues = cues;
  updateStatus();
  if (trackChanged) {
    // New source language → translations from the old track no longer apply.
    onTranslationConfigChanged();
  } else if (cues.length && cues[0].startTime !== lastFirstStart) {
    // Front of the list moved (cues evicted): index→translation mappings are
    // now misaligned. Drop them; the content-keyed cache makes re-resolution of
    // still-visible cues instantaneous (no extra network requests).
    stopTranslations();
  }
  lastFirstStart = cues.length ? cues[0].startTime : -1;
  // Indices into state.cues may now map to different cues, so the renderer's
  // index-based cache must be discarded.
  invalidateRender();
  render();
}
