/**
 * Minimal WebVTT parsing shared by the Chrome extension and the Samsung TV app.
 */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
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

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, "");

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
  // Right-pad to milliseconds without String#padEnd (missing on older TV browsers).
  const msRaw = m[4];
  const ms = parseInt(msRaw + "000".slice(msRaw.length), 10);
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** Parse a WebVTT document into plain cues (tags stripped, entities decoded). */
export function parseVtt(input: string): SubtitleCue[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const cues: SubtitleCue[] = [];
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
      const text = decodeEntities(stripTags(textLines.join("\n"))).trim();
      if (text && isFinite(start) && isFinite(end)) {
        cues.push({ start, end, text });
      }
    } else {
      i++;
    }
  }
  return cues;
}
