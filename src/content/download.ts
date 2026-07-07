/**
 * Subtitle accumulation and .srt export.
 *
 * The NRK player streams subtitles in segments and evicts cues that fall
 * outside its back-buffer, so `state.cues` is only ever a rolling window — never
 * the whole file. To offer a complete download we accumulate every cue we ever
 * see (keyed by start time) into a persistent map that survives eviction, then
 * serialise it to SubRip (.srt) on demand.
 */

import { state } from "./state";
import { cueText } from "./utils";

interface AccumulatedCue {
  start: number;
  end: number;
  text: string;
}

/** Every distinct cue seen so far for the current track, keyed by start time. */
const accumulated = new Map<string, AccumulatedCue>();

/** Notify listeners (the overlay) that subtitle availability may have changed. */
function notifyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nsr-subtitles-updated"));
  }
}

/** Fold the current cue snapshot into the accumulated set. */
export function accumulateCues(cues: TextTrackCue[]): void {
  const before = accumulated.size;
  for (const cue of cues) {
    const text = cueText(cue).trim();
    if (!text) continue;
    accumulated.set(cue.startTime.toFixed(3), {
      start: cue.startTime,
      end: (cue as VTTCue).endTime,
      text,
    });
  }
  if (accumulated.size !== before) notifyChanged();
}

/** Drop everything (e.g. on track change, navigation or teardown). */
export function resetAccumulatedCues(): void {
  if (accumulated.size === 0) return;
  accumulated.clear();
  notifyChanged();
}

/** True once at least one subtitle line has been loaded. */
export const hasSubtitles = (): boolean => accumulated.size > 0;

/** Format seconds as SubRip timestamp `HH:MM:SS,mmm`. */
function srtTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const total = Math.floor(clamped);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Serialise the accumulated cues to a SubRip (.srt) document. */
export function buildSrt(): string {
  const items = Array.from(accumulated.values()).sort((a, b) => a.start - b.start);
  return (
    items
      .map((c, i) => {
        const text = c.text.replace(/\r?\n/g, "\n");
        return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${text}`;
      })
      .join("\n\n") + "\n"
  );
}

/** Best-effort, filesystem-safe file name derived from the page/track. */
function fileName(): string {
  let base = "";
  try {
    base = (document.title || "").replace(/\s*[-–|]\s*NRK.*$/i, "").trim();
  } catch {
    // ignore
  }
  if (!base) base = "nrk-subtitles";
  const lang = state.track?.language || state.track?.label || "";
  const safe = `${base}${lang ? `.${lang}` : ""}`
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "nrk-subtitles"}.srt`;
}

/** Build the .srt and trigger a browser download. */
export function downloadSrt(): void {
  if (!hasSubtitles()) return;
  const blob = new Blob([buildSrt()], { type: "application/x-subrip;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName();
  a.style.display = "none";
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
  self.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
