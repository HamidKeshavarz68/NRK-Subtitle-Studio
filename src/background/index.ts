/**
 * NRK Subtitle Studio — background service worker
 *
 * The tv.nrk.no page has a strict Content-Security-Policy that blocks
 * `connect-src` to translate.googleapis.com, even from our content script.
 * Service worker fetches are NOT subject to the page CSP, so we proxy all
 * translation requests through here.
 */

import { handleRuntimeRequest, isRuntimeRequest } from "../shared/extension/request-handler";
import { runtime } from "../shared/extension/runtime";

runtime.onMessage.addListener((msg: unknown, _sender: unknown, sendResponse) => {
  if (!isRuntimeRequest(msg)) return;

  handleRuntimeRequest(msg).then(
    (text) => sendResponse({ ok: true, text }),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
  );

  // Keep the message channel open for the async sendResponse.
  return true;
});