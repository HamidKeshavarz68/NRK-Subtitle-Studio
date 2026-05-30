/**
 * Video / text-track discovery and cue capture.
 *
 * tv.nrk.no is a SPA, so the <video> appears asynchronously and can be swapped
 * across navigations. We attach listeners (cleanly detachable), force subtitle
 * tracks to `hidden` so the browser parses every cue, and snapshot cues into
 * shared state whenever they grow.
 */

import { applyPlaybackRate, settings, state, ui } from "./state";
import { isSubtitleTrack } from "./utils";
import { render, setStatus, updateStatus } from "./renderer";
import { onTranslationConfigChanged } from "./translator";
import { NATIVE_OVERRIDDEN } from "./native-subtitles";

/** Marker so each track is hooked for cue updates only once. */
const HOOKED = "__nsrHooked";

let detach: (() => void) | null = null;

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
  setStatus("video found");

  const refresh = () => scanTextTracks(video);
  const onSeeked = () => render();
  const onRateChange = () => {
    if (Math.abs(video.playbackRate - settings.playbackRate) > 0.001) {
      try { video.playbackRate = settings.playbackRate; } catch { /* ignore */ }
    }
  };

  video.textTracks.addEventListener("addtrack", refresh);
  video.textTracks.addEventListener("removetrack", refresh);
  video.addEventListener("timeupdate", render);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("loadedmetadata", refresh);
  // Re-apply our chosen playback rate if the player resets it.
  video.addEventListener("ratechange", onRateChange);

  detach = () => {
    video.textTracks.removeEventListener("addtrack", refresh);
    video.textTracks.removeEventListener("removetrack", refresh);
    video.removeEventListener("timeupdate", render);
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

    // (1) Always make sure cues get parsed: 'disabled' → 'hidden'.
    if (t.mode === "disabled") {
      try { t.mode = "hidden"; } catch { /* ignore */ }
    }

    // (2) While the overlay is expanded, hide NRK's native rendering by
    // flipping any 'showing' track to 'hidden'. Mark it so we can restore it.
    if (ui.isExpanded && t.mode === "showing") {
      (t as any)[NATIVE_OVERRIDDEN] = true;
      try { t.mode = "hidden"; } catch { /* ignore */ }
    }

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

function snapshotCues(track: TextTrack): void {
  if (!track.cues) return;
  const cues = Array.from(track.cues);
  if (cues.length <= state.cues.length && state.track === track) return;

  const trackChanged = state.track !== track;
  state.track = track;
  state.cues = cues;
  updateStatus();
  if (trackChanged) {
    // New source language → translations from the old track no longer apply.
    onTranslationConfigChanged();
  }
  render();
}
