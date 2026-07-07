/**
 * Fetching the *complete* subtitle file for the current NRK programme.
 *
 * The player only streams subtitle segments as they play, so the in-page cues
 * never cover the whole video. NRK's public playback manifest, however, exposes
 * a single WebVTT file per subtitle track covering the entire programme:
 *
 *   https://psapi.nrk.no/playback/manifest/program/{id}
 *     -> playable.subtitles[].webVtt  (full-video WebVTT URL)
 *
 * We resolve the programme id from the page URL, fetch the manifest and the VTT
 * through the background service worker (the page CSP blocks direct fetches),
 * and parse the VTT into plain cues.
 */

import { state } from "./state";
import { stripHtml } from "./utils";

declare const chrome: any;

export interface RemoteCue {
  start: number;
  end: number;
  text: string;
}

export interface RemoteSubtitles {
  cues: RemoteCue[];
  language: string;
}

/** NRK programme ids look like `DVFJ65100124`, `KOID20005923`, `MSUS27000117`. */
const PROGRAM_ID_RE = /^[A-Za-z]{2,6}\d{6,}$/;

/** Best-effort extraction of the programme id from the current tv.nrk.no URL. */
export function extractProgramId(): string | null {
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return null;
  }

  for (const key of ["v", "p", "program", "programId"]) {
    const val = url.searchParams.get(key);
    if (val && PROGRAM_ID_RE.test(val)) return val.toUpperCase();
  }

  const segs = url.pathname.split("/").filter(Boolean);
  for (let i = 0; i < segs.length; i++) {
    if ((segs[i] === "episode" || segs[i] === "program") && segs[i + 1]) {
      const cand = decodeURIComponent(segs[i + 1]);
      if (PROGRAM_ID_RE.test(cand)) return cand.toUpperCase();
    }
  }
  // Fallback: last path segment that looks like an id.
  for (let i = segs.length - 1; i >= 0; i--) {
    const cand = decodeURIComponent(segs[i]);
    if (PROGRAM_ID_RE.test(cand)) return cand.toUpperCase();
  }
  return null;
}

/** Fetch a NRK URL as text via the background proxy (bypasses page CSP). */
function nrkFetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: "nrk-fetch", url }, (resp: any) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message || "runtime error"));
        if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || "fetch failed"));
        resolve(String(resp.text || ""));
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITIES[m] ?? m);
}

/** Parse a WebVTT/SRT-ish timestamp (`HH:MM:SS.mmm` or `MM:SS.mmm`) to seconds. */
function timestampToSeconds(ts: string): number {
  const m = ts.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return NaN;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ms = parseInt(m[4].padEnd(3, "0"), 10);
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** Parse a WebVTT document into plain cues (tags stripped, entities decoded). */
export function parseVtt(input: string): RemoteCue[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const cues: RemoteCue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const arrow = line.indexOf("-->");
    if (arrow !== -1) {
      const startRaw = line.slice(0, arrow);
      const endRaw = line.slice(arrow + 3).trim().split(/\s+/)[0] || "";
      const start = timestampToSeconds(startRaw);
      const end = timestampToSeconds(endRaw);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      const text = decodeEntities(stripHtml(textLines.join("\n"))).trim();
      if (text && isFinite(start) && isFinite(end)) {
        cues.push({ start, end, text });
      }
    } else {
      i++;
    }
  }
  return cues;
}

interface ManifestSubtitle {
  type?: string;
  language?: string;
  label?: string;
  defaultOn?: boolean;
  webVtt?: string;
}

/** Choose the manifest subtitle track best matching what the user is watching. */
function pickTrack(subs: ManifestSubtitle[]): ManifestSubtitle | null {
  if (!subs.length) return null;
  const want = (state.track?.language || "").toLowerCase().split("-")[0];
  const matches = want
    ? subs.filter((s) => (s.language || "").toLowerCase().split("-")[0] === want)
    : [];
  return (
    matches.find((s) => s.defaultOn) ||
    matches[0] ||
    subs.find((s) => s.defaultOn) ||
    subs[0] ||
    null
  );
}

/**
 * Fetch and parse the full-video subtitles for the current programme, or null
 * if the programme id / manifest / subtitle track can't be resolved.
 */
export async function fetchFullSubtitles(): Promise<RemoteSubtitles | null> {
  const id = extractProgramId();
  if (!id) return null;

  let manifest: any;
  try {
    const raw = await nrkFetchText(`https://psapi.nrk.no/playback/manifest/program/${id}`);
    manifest = JSON.parse(raw);
  } catch {
    return null;
  }

  const subs: ManifestSubtitle[] = manifest?.playable?.subtitles;
  if (!Array.isArray(subs) || !subs.length) return null;

  const track = pickTrack(subs);
  if (!track?.webVtt) return null;

  try {
    const vtt = await nrkFetchText(track.webVtt);
    const cues = parseVtt(vtt);
    if (!cues.length) return null;
    return { cues, language: track.language || "" };
  } catch {
    return null;
  }
}
