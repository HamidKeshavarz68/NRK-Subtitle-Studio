/**
 * NRK Subtitle Studio — background service worker
 *
 * The tv.nrk.no page has a strict Content-Security-Policy that blocks
 * `connect-src` to translate.googleapis.com, even from our content script.
 * Service worker fetches are NOT subject to the page CSP, so we proxy all
 * translation requests through here.
 */

declare const chrome: any;

type TranslateRequest = {
  type: "translate";
  text?: unknown;
  source?: unknown;
  target?: unknown;
  provider?: unknown;
  apiKey?: unknown;
};

type NrkFetchRequest = {
  type: "nrk-fetch";
  url?: unknown;
};

function isTranslateRequest(msg: unknown): msg is TranslateRequest {
  return !!msg && typeof msg === "object" && (msg as { type?: unknown }).type === "translate";
}

function isNrkFetchRequest(msg: unknown): msg is NrkFetchRequest {
  return !!msg && typeof msg === "object" && (msg as { type?: unknown }).type === "nrk-fetch";
}

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

chrome.runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse: (resp: any) => void) => {
  if (isNrkFetchRequest(msg)) {
    (async () => {
      try {
        const url = String(msg.url ?? "");
        if (!isAllowedNrkUrl(url)) {
          sendResponse({ ok: false, error: "url not allowed" });
          return;
        }
        const res = await fetch(url, { method: "GET", credentials: "omit" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        sendResponse({ ok: true, text: await res.text() });
      } catch (e: unknown) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (!isTranslateRequest(msg)) return;

  (async () => {
    try {
      const target = String(msg.target ?? "");
      const source = String(msg.source ?? "auto");
      const text = String(msg.text ?? "");
      const provider = String(msg.provider ?? "google");
      if (!target || !text) {
        sendResponse({ ok: false, error: "missing target/text" });
        return;
      }

      if (provider === "deepl") {
        const apiKey = String(msg.apiKey ?? "");
        const out = await deeplTranslate(text, target, apiKey);
        sendResponse({ ok: true, text: out });
        return;
      }

      const res = await fetch(buildTranslateUrl(source, target, text), {
        method: "GET",
        credentials: "omit",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data: unknown = await res.json();
      sendResponse({ ok: true, text: extractTranslatedText(data) });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, error: message });
    }
  })();

  // Keep the message channel open for the async sendResponse.
  return true;
});

