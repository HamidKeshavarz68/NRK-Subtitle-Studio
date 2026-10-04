/**
 * Auto pause for the extension: pauses NRK's <video> at the end of each
 * subtitle line and, when chosen, resumes it after a few seconds. Polls the
 * play head every 50 ms while playing (timeupdate alone is too coarse).
 */

import { AutoPauseDetector, type TimedLine } from "../../shared/subtitles/autopause";
import { settings, state } from "../core/state";

const POLL_MS = 50;

export function attachAutoPause(video: HTMLVideoElement): () => void {
  const detector = new AutoPauseDetector();
  let poll = 0;
  let resumeTimer = 0;
  /** True while the video is paused by us (not by the user). */
  let autoPaused = false;
  let lines: TimedLine[] = [];
  let linesFrom: TextTrackCue[] | null = null;

  function currentLines(): TimedLine[] {
    if (linesFrom !== state.cues) {
      linesFrom = state.cues;
      lines = state.cues.map((c) => ({ start: c.startTime, end: c.endTime }));
    }
    return lines;
  }

  function cancelResume(): void {
    clearTimeout(resumeTimer);
    resumeTimer = 0;
  }

  function tick(): void {
    if (settings.autoPause === 0 || video.paused || video.seeking || !state.cues.length) return;
    if (detector.check(currentLines(), video.currentTime) < 0) return;
    autoPaused = true;
    video.pause();
    cancelResume();
    if (settings.autoPause > 0) {
      resumeTimer = window.setTimeout(() => {
        resumeTimer = 0;
        if (autoPaused && video.paused && settings.autoPause > 0) void video.play().catch(() => undefined);
      }, settings.autoPause * 1000);
    }
  }

  function start(): void {
    autoPaused = false;
    cancelResume();
    if (!poll) poll = window.setInterval(tick, POLL_MS);
  }
  function stop(): void {
    clearInterval(poll);
    poll = 0;
  }
  function onSeeking(): void {
    detector.reset();
    autoPaused = false;
    cancelResume();
  }

  video.addEventListener("play", start);
  video.addEventListener("pause", stop);
  video.addEventListener("seeking", onSeeking);
  if (!video.paused) start();

  return () => {
    stop();
    cancelResume();
    video.removeEventListener("play", start);
    video.removeEventListener("pause", stop);
    video.removeEventListener("seeking", onSeeking);
  };
}
