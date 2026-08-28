import { normalizeWhitespace } from "../core/utils";

const cache = new Map<string, string>();
const queue: Array<() => Promise<void>> = [];
let running = false;
const MAX_QUEUE = 500;
const TRANSLATE_TIMEOUT_MS = 8000;

function cacheKey(source: string, target: string, text: string): string {
  return `${source}|${target}|${normalizeWhitespace(text)}`;
}

function extractTranslatedText(data: unknown): string {
  const segs = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(segs)) return "";
  return segs.map((segment) => {
    if (!Array.isArray(segment)) return "";
    return String(segment[0] ?? "");
  }).join("");
}

async function googleTranslate(text: string, source: string, target: string): Promise<string> {
  // Uses the same unofficial endpoint as the extension build (best-effort only).
  // It may be rate-limited or changed without notice, so failures are expected.
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    "&sl=" + encodeURIComponent(source || "auto") +
    "&tl=" + encodeURIComponent(target) +
    "&dt=t" +
    "&q=" + encodeURIComponent(text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Translate failed (${res.status})`);
  const data: unknown = await res.json();
  return extractTranslatedText(data).trim();
}

async function runQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;
      await job();
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  } finally {
    running = false;
  }
}

export function enqueueTranslate(
  text: string,
  source: string,
  target: string,
  onDone: (result: string) => void,
  onError: (error: Error) => void
): void {
  const key = cacheKey(source, target, text);
  const cached = cache.get(key);
  if (cached !== undefined) {
    onDone(cached);
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    onError(new Error("Translation queue is full."));
    return;
  }

  queue.push(async () => {
    try {
      const out = await googleTranslate(text, source, target);
      cache.set(key, out);
      onDone(out);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  });

  void runQueue();
}

export function clearTranslationCache(): void {
  cache.clear();
  queue.length = 0;
}
