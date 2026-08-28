import type { Cue, LoadedProgram, SubtitleTrack } from "../core/types";
import { parseVtt } from "../core/utils";

const PROGRAM_ID_RE = /^[A-Za-z]{2,6}\d{6,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function extractProgramId(raw: string): string | null {
  const trimmed = raw.trim();
  if (PROGRAM_ID_RE.test(trimmed)) return trimmed.toUpperCase();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  for (const key of ["v", "p", "program", "programId"]) {
    const val = url.searchParams.get(key);
    if (val && PROGRAM_ID_RE.test(val)) return val.toUpperCase();
  }

  const segs = url.pathname.split("/").filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const cand = decodeURIComponent(segs[i]);
    if (PROGRAM_ID_RE.test(cand)) return cand.toUpperCase();
  }
  return null;
}

function extractSubtitles(manifest: unknown): SubtitleTrack[] {
  if (!isRecord(manifest) || !isRecord(manifest.playable)) return [];
  const raw = manifest.playable.subtitles;
  if (!Array.isArray(raw)) return [];
  const subs: SubtitleTrack[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.webVtt !== "string") continue;
    subs.push({
      language: typeof entry.language === "string" ? entry.language : "",
      label: typeof entry.label === "string" ? entry.label : "",
      webVtt: entry.webVtt,
      defaultOn: entry.defaultOn === true,
    });
  }
  return subs;
}

function collectUrls(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectUrls(v, out));
    return;
  }
  if (!isRecord(value)) return;
  Object.values(value).forEach((v) => collectUrls(v, out));
}

function pickVideoUrl(manifest: unknown): string | null {
  const urls: string[] = [];
  collectUrls(manifest, urls);
  const playable = urls.filter((u) => {
    const lower = u.toLowerCase();
    return lower.endsWith(".m3u8") || lower.endsWith(".mp4") || lower.endsWith(".mpd");
  });
  if (!playable.length) return null;
  return (
    playable.find((u) => u.toLowerCase().includes(".m3u8")) ||
    playable.find((u) => u.toLowerCase().includes(".mp4")) ||
    playable[0]
  );
}

export async function loadProgram(input: string): Promise<LoadedProgram> {
  const programId = extractProgramId(input);
  if (!programId) throw new Error("Could not find a valid NRK programme id in the input.");

  const manifestRes = await fetch(`https://psapi.nrk.no/playback/manifest/program/${programId}`);
  if (!manifestRes.ok) throw new Error(`Manifest fetch failed (${manifestRes.status}).`);
  const manifest: unknown = await manifestRes.json();

  return {
    programId,
    videoUrl: pickVideoUrl(manifest),
    subtitles: extractSubtitles(manifest),
  };
}

export async function loadSubtitleCues(track: SubtitleTrack): Promise<Cue[]> {
  const res = await fetch(track.webVtt);
  if (!res.ok) throw new Error(`Subtitle fetch failed (${res.status}).`);
  const raw = await res.text();
  return parseVtt(raw);
}
