/**
 * NRK Subtitle Studio — background service worker
 *
 * The tv.nrk.no page has a strict Content-Security-Policy that blocks
 * `connect-src` to translate.googleapis.com, even from our content script.
 * Service worker fetches are NOT subject to the page CSP, so we proxy all
 * translation requests through here.
 */

import type { RuntimeRequest } from "../shared/extension/messages";
import { runtime } from "../shared/extension/runtime";
import {
  deeplApiBase,
  deeplHeaders,
  deeplTargetLang,
  deeplTranslateBody,
  parseDeeplTranslations,
} from "../shared/translation/deepl";

function hasMessageType<T extends RuntimeRequest["type"]>(
  message: unknown,
  type: T
): message is Record<string, unknown> & { type: T } {
  return !!message && typeof message === "object" &&
    (message as Record<string, unknown>).type === type;
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

async function deeplTranslate(text: string, target: string, apiKey: string): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("missing DeepL API key");
  const tl = deeplTargetLang(target);
  if (!tl) throw new Error("unsupported DeepL target language: " + target);

  const res = await fetch(deeplApiBase(key) + "/translate", {
    method: "POST",
    headers: deeplHeaders(key),
    body: deeplTranslateBody(text.split(/\s*@@@\s*/g), tl),
    credentials: "omit",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);

  return parseDeeplTranslations(await res.json()).join(DEEPL_SEPARATOR);
}

runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse) => {
  if (hasMessageType(msg, "nrk-fetch")) {
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

  if (!hasMessageType(msg, "translate")) return;

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
