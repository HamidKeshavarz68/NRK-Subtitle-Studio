import type { Cue } from "./types";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITIES[m] ?? m);
}

function timestampToSeconds(ts: string): number {
  const m = ts.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return NaN;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ms = parseInt(m[4].padEnd(3, "0"), 10);
  return h * 3600 + min * 60 + sec + ms / 1000;
}

export function parseVtt(input: string): Cue[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const cues: Cue[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const arrow = line.indexOf("-->");
    if (arrow === -1) {
      i++;
      continue;
    }
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
  }

  return cues;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
