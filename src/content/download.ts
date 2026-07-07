/**
 * Subtitle download and .srt export.
 *
 * Two problems are solved here:
 *
 *  1. Whole video. The NRK player only streams subtitle segments as they play
 *     and evicts old ones, so the in-page cues never cover the full programme.
 *     For downloads we therefore fetch the complete WebVTT file from NRK's
 *     playback manifest (see remote-subtitles.ts). If that can't be resolved we
 *     fall back to whatever cues have been accumulated from the player.
 *
 *  2. Translation. When translation is enabled the whole file is translated
 *     through the same background proxy the overlay uses, and written into the
 *     .srt as translated-only or bilingual output (matching the display mode).
 */

import { isTranslationActive, settings, state } from "./state";
import { cueText } from "./utils";
import { fetchFullSubtitles, RemoteCue } from "./remote-subtitles";
import { translateTexts } from "./translator";

/** Every distinct cue seen so far from the player, keyed by start time. */
const accumulated = new Map<string, RemoteCue>();

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

/** True once at least one subtitle line is available. */
export const hasSubtitles = (): boolean => accumulated.size > 0;

function accumulatedSorted(): RemoteCue[] {
  return Array.from(accumulated.values()).sort((a, b) => a.start - b.start);
}

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

/** Serialise cues (with optional translations) to a SubRip (.srt) document. */
function buildSrt(cues: RemoteCue[], translations: string[] | null): string {
  return (
    cues
      .map((c, i) => {
        let body = c.text;
        if (translations) {
          const tr = (translations[i] || "").trim();
          if (settings.displayMode === "translated") {
            body = tr || c.text;
          } else if (tr) {
            body = `${c.text}\n${tr}`; // bilingual
          }
        }
        return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${body.replace(/\r?\n/g, "\n")}`;
      })
      .join("\n\n") + "\n"
  );
}

/** Best-effort, filesystem-safe file name derived from the page/track. */
function fileName(lang: string): string {
  let base = "";
  try {
    base = (document.title || "").replace(/\s*[-–|]\s*NRK.*$/i, "").trim();
  } catch {
    // ignore
  }
  if (!base) base = "nrk-subtitles";
  const safe = `${base}${lang ? `.${lang}` : ""}`
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "nrk-subtitles"}.srt`;
}

function triggerDownload(content: string, name: string): void {
  const blob = new Blob([content], { type: "application/x-subrip;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
  self.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Build the .srt for the whole programme (translating if enabled) and trigger a
 * browser download. Returns false if no subtitles could be produced.
 */
export async function downloadSrt(): Promise<boolean> {
  // Prefer the complete manifest file; fall back to the accumulated player cues.
  const remote = await fetchFullSubtitles();
  const cues = remote?.cues.length ? remote.cues : accumulatedSorted();
  if (!cues.length) return false;

  const lang = remote?.language || state.track?.language || "";

  let translations: string[] | null = null;
  if (isTranslationActive()) {
    translations = await translateTexts(cues.map((c) => c.text));
  }

  triggerDownload(buildSrt(cues, translations), fileName(lang));
  return true;
}
