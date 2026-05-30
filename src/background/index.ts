/**
 * NRK Subtitle Studio — background service worker
 *
 * The tv.nrk.no page has a strict Content-Security-Policy that blocks
 * `connect-src` to translate.googleapis.com, even from our content script.
 * Service worker fetches are NOT subject to the page CSP, so we proxy all
 * translation requests through here.
 */

declare const chrome: any;

chrome.runtime.onMessage.addListener(
  (msg: any, _sender: any, sendResponse: (resp: any) => void) => {
    if (!msg || msg.type !== "translate") return;

    (async () => {
      try {
        const target = String(msg.target || "");
        const source = String(msg.source || "auto");
        const text = String(msg.text || "");
        if (!target || !text) {
          sendResponse({ ok: false, error: "missing target/text" });
          return;
        }
        const url =
          "https://translate.googleapis.com/translate_a/single" +
          "?client=gtx" +
          "&sl=" + encodeURIComponent(source) +
          "&tl=" + encodeURIComponent(target) +
          "&dt=t" +
          "&q=" + encodeURIComponent(text);
        const res = await fetch(url, { method: "GET", credentials: "omit" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const segs = data && data[0];
        const out = Array.isArray(segs)
          ? segs.map((s: any) => (s && s[0]) || "").join("")
          : "";
        sendResponse({ ok: true, text: out });
      } catch (e: any) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();

    // Keep the message channel open for the async sendResponse.
    return true;
  }
);

