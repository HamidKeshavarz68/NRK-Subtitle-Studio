/**
 * Network side of every RuntimeRequest: NRK fetches and translation calls.
 *
 * The Chrome extension runs this in its background service worker (outside the
 * page's CSP); the TizenBrew build calls it directly from the page.
 */

import type { RuntimeRequest } from "./messages";

/** Only NRK-owned hosts may be proxied, to keep this a narrow, safe helper. */
function isAllowedNrkUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "nrk.no" || host.endsWith(".nrk.no");
  } catch {
    return false;
  }
}

function buildTranslateUrl(source: string, target: string, text: string): string {
  return (
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    "&sl=" + encodeURIComponent(source) +
    "&tl=" + encodeURIComponent(target) +
    "&dt=t" +
    "&q=" + encodeURIComponent(text)
  );
}

function extractTranslatedText(data: unknown): string {
  const segs = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(segs)) return "";
  return segs.map((segment) => {
    if (!Array.isArray(segment)) return "";
    return String(segment[0] ?? "");
  }).join("");
}

// ---------- DeepL ----------
// The content script joins cues with a "@@@" separator into a single request.
// DeepL preserves that separator poorly, so we split the payload back into
// individual cues, send them as separate `text` parameters (DeepL accepts many
// per request), then rejoin the translations with the same separator so the
// content script's existing split logic recovers them cleanly.
const DEEPL_SEPARATOR = "\n\n@@@\n\n";

/** Map our BCP-47 base codes to DeepL target languages; null = unsupported. */
function deeplTargetLang(base: string): string | null {
  const code = (base || "").toLowerCase().split("-")[0];
  const map: Record<string, string> = {
    en: "EN-US", pt: "PT-PT", zh: "ZH", nb: "NB", no: "NB",
    ar: "AR", bg: "BG", cs: "CS", da: "DA", de: "DE", el: "EL",
    es: "ES", et: "ET", fi: "FI", fr: "FR", hu: "HU", id: "ID",
    it: "IT", ja: "JA", ko: "KO", lt: "LT", lv: "LV", nl: "NL",
    pl: "PL", ro: "RO", ru: "RU", sk: "SK", sl: "SL", sv: "SV",
    tr: "TR", uk: "UK",
  };
  return map[code] ?? null;
}

/** Free-tier keys end in ":fx" and use a separate host from Pro keys. */
function deeplEndpoint(key: string): string {
  const host = key.trim().endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  return `https://${host}/v2/translate`;
}

async function deeplTranslate(text: string, target: string, apiKey: string): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("missing DeepL API key");
  const tl = deeplTargetLang(target);
  if (!tl) throw new Error("unsupported DeepL target language: " + target);

  const pieces = text.split(/\s*@@@\s*/g);
  const body = new URLSearchParams();
  body.set("target_lang", tl);
  for (const piece of pieces) body.append("text", piece);

  const res = await fetch(deeplEndpoint(key), {
    method: "POST",
    headers: {
      "Authorization": "DeepL-Auth-Key " + key,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    credentials: "omit",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);

  const data: unknown = await res.json();
  const translations = (data as { translations?: Array<{ text?: unknown }> })?.translations;
  if (!Array.isArray(translations)) throw new Error("bad DeepL response");
  return translations.map((t) => String(t?.text ?? "")).join(DEEPL_SEPARATOR);
}

async function nrkFetch(rawUrl: unknown): Promise<string> {
  const url = String(rawUrl ?? "");
  if (!isAllowedNrkUrl(url)) throw new Error("url not allowed");
  const res = await fetch(url, { method: "GET", credentials: "omit" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

async function translate(msg: Record<string, unknown>): Promise<string> {
  const target = String(msg.target ?? "");
  const source = String(msg.source ?? "auto");
  const text = String(msg.text ?? "");
  const provider = String(msg.provider ?? "google");
  if (!target || !text) throw new Error("missing target/text");

  if (provider === "deepl") {
    return deeplTranslate(text, target, String(msg.apiKey ?? ""));
  }

  const res = await fetch(buildTranslateUrl(source, target, text), {
    method: "GET",
    credentials: "omit",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data: unknown = await res.json();
  return extractTranslatedText(data);
}

export function isRuntimeRequest(message: unknown): message is RuntimeRequest {
  if (!message || typeof message !== "object") return false;
  const type = (message as Record<string, unknown>).type;
  return type === "nrk-fetch" || type === "translate";
}

/** Perform a request and resolve with its text payload; rejects on failure. */
export function handleRuntimeRequest(request: RuntimeRequest): Promise<string> {
  const msg = request as unknown as Record<string, unknown>;
  return request.type === "nrk-fetch" ? nrkFetch(msg.url) : translate(msg);
}
