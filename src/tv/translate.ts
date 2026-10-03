/**
 * Translates a whole subtitle file in the background. Uses DeepL when an API
 * key is set in Settings and falls back to Google's free "gtx" endpoint when
 * there is no key, DeepL rejects it, or a DeepL request fails. Work starts at
 * the current playback position and continues forward, so the lines you are
 * about to see are translated first.
 */

import { TRANSLATE } from "../content/core/config";
import type { SubtitleCue } from "../shared/subtitles/vtt";
import {
  deeplApiBase,
  deeplHeaders,
  deeplTargetLang,
  deeplTranslateBody,
  parseDeeplTranslations,
} from "../shared/translation/deepl";
import { fetchText, HttpError } from "./net";
import { settings } from "./settings";

const MAX_CHARS = 1200;
const MAX_ITEMS = 60;
const SPLIT_RE = /\s*@@@\s*/g;

const cache: Record<string, string> = {};

export type Provider = "deepl" | "google";

/** Last key DeepL refused (bad key or quota used up); skipped until the key changes. */
let rejected: { key: string; reason: string } | null = null;

function deeplRejection(e: unknown): string {
  if (!(e instanceof HttpError)) return "";
  if (e.status === 401 || e.status === 403) return "DeepL key rejected";
  if (e.status === 456) return "DeepL quota used up";
  return "";
}

async function deepl(texts: string[], targetLang: string, key: string): Promise<string[]> {
  const raw = await fetchText(deeplApiBase(key) + "/translate", {
    method: "POST",
    headers: deeplHeaders(key),
    body: deeplTranslateBody(texts, targetLang),
  });
  const out = parseDeeplTranslations(JSON.parse(raw));
  if (out.length !== texts.length) throw new Error(`DeepL returned ${out.length} of ${texts.length} lines`);
  return out;
}

/** Check a DeepL key against /v2/usage and describe the result for the Settings screen. */
export async function checkDeeplKey(rawKey: string): Promise<string> {
  const key = rawKey.trim();
  if (!key) return "No DeepL key: subtitles are translated with Google Translate.";
  try {
    const raw = await fetchText(deeplApiBase(key) + "/usage", {
      headers: { Authorization: deeplHeaders(key).Authorization },
    });
    if (rejected && rejected.key === key) rejected = null;
    const usage = JSON.parse(raw) as { character_count?: unknown; character_limit?: unknown };
    const used = Number(usage.character_count);
    const limit = Number(usage.character_limit);
    const detail = isFinite(used) && isFinite(limit) && limit > 0
      ? ` (${used.toLocaleString()} of ${limit.toLocaleString()} characters used this period)`
      : "";
    return "DeepL key works" + detail + ". Subtitles will be translated with DeepL.";
  } catch (e) {
    const rejection = deeplRejection(e);
    if (rejection) {
      rejected = { key, reason: rejection };
      return rejection + ". Subtitles will be translated with Google Translate.";
    }
    const msg = e instanceof Error ? e.message : String(e);
    return `Could not reach DeepL (${msg}). Subtitles will fall back to Google Translate.`;
  }
}

function sourceFor(lang: string): string {
  return /^(nb|nn|no)/i.test(lang) ? "no" : "auto";
}

async function gtx(source: string, target: string, text: string): Promise<string> {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
    "&sl=" + encodeURIComponent(source) +
    "&tl=" + encodeURIComponent(target) +
    "&q=" + encodeURIComponent(text);
  const data = JSON.parse(await fetchText(url)) as unknown;
  const segs = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : [];
  return segs.map((s) => (Array.isArray(s) && typeof s[0] === "string" ? s[0] : "")).join("");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CueTranslator {
  /** Translations by cue index; undefined = not done yet. */
  readonly out: (string | undefined)[];
  failed = false;
  /** Who translated the most recent batch; null until the first one is done. */
  provider: Provider | null = null;
  /** Why DeepL isn't used although a key is set ("" when it is, or when there's no key). */
  deeplIssue = "";
  private cursor = 0;
  private running = false;
  private stopped = false;
  private source: string;

  constructor(
    private cues: SubtitleCue[],
    sourceLang: string,
    private target: string,
    private onUpdate: () => void
  ) {
    this.out = new Array(cues.length);
    this.source = sourceFor(sourceLang);
    for (let i = 0; i < cues.length; i++) {
      const hit = cache[this.key(i)];
      if (hit !== undefined) this.out[i] = hit;
    }
  }

  private key(i: number): string {
    return this.source + "|" + this.target + "|" + norm(this.cues[i].text);
  }

  /** Translate from cue `index` onwards next (call on start and after seeks). */
  focusOn(index: number): void {
    this.cursor = Math.max(0, index - 2);
    if (!this.running) void this.loop();
  }

  stop(): void {
    this.stopped = true;
  }

  private nextPending(): number {
    const n = this.cues.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (this.out[i] === undefined) return i;
    }
    return -1;
  }

  private async loop(): Promise<void> {
    this.running = true;
    let errors = 0;
    try {
      while (!this.stopped) {
        const start = this.nextPending();
        if (start < 0) break;

        const indices: number[] = [];
        let chars = 0;
        for (let i = start; i < this.cues.length && indices.length < MAX_ITEMS; i++) {
          if (this.out[i] !== undefined) {
            if (indices.length) break;
            continue;
          }
          const len = this.cues[i].text.length + TRANSLATE.separator.length;
          if (indices.length && chars + len > MAX_CHARS) break;
          indices.push(i);
          chars += len;
        }

        try {
          await this.translateBatch(indices);
          errors = 0;
          this.failed = false;
          this.cursor = indices[indices.length - 1] + 1;
        } catch (e) {
          errors++;
          console.warn("[nss-tv] translation failed", e);
          if (errors >= 3) {
            this.failed = true;
            this.onUpdate();
            await wait(15000);
          } else {
            await wait(1500 * errors);
          }
          continue;
        }
        this.onUpdate();
        await wait(TRANSLATE.reqDelayMs);
      }
    } finally {
      this.running = false;
    }
  }

  /** The DeepL key to try for the next batch, or "" to go straight to Google. */
  private deeplKey(): string {
    const key = settings.deeplApiKey.trim();
    if (!key) {
      this.deeplIssue = "";
      return "";
    }
    if (!deeplTargetLang(this.target)) {
      this.deeplIssue = "language not supported by DeepL";
      return "";
    }
    if (rejected && rejected.key === key) {
      this.deeplIssue = rejected.reason;
      return "";
    }
    return key;
  }

  private async translateBatch(indices: number[]): Promise<void> {
    const texts = indices.map((i) => this.cues[i].text);

    const key = this.deeplKey();
    if (key) {
      try {
        const parts = await deepl(texts, deeplTargetLang(this.target)!, key);
        indices.forEach((idx, k) => this.store(idx, parts[k].trim()));
        this.provider = "deepl";
        this.deeplIssue = "";
        return;
      } catch (e) {
        console.warn("[nss-tv] DeepL failed, using Google Translate", e);
        const rejection = deeplRejection(e);
        if (rejection) rejected = { key, reason: rejection };
        this.deeplIssue = rejection || "DeepL unavailable";
      }
    }

    this.provider = "google";
    const joined = texts.join(TRANSLATE.separator);
    const result = await gtx(this.source, this.target, joined);
    const parts = result.split(SPLIT_RE);
    if (parts.length === indices.length) {
      indices.forEach((idx, k) => this.store(idx, parts[k].trim()));
      return;
    }
    // Separator got mangled: fall back to one request per cue.
    for (const idx of indices) {
      if (this.stopped) return;
      this.store(idx, (await gtx(this.source, this.target, this.cues[idx].text)).trim());
      await wait(TRANSLATE.reqDelayMs);
    }
  }

  private store(i: number, text: string): void {
    this.out[i] = text;
    cache[this.key(i)] = text;
  }
}
