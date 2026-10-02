/**
 * Network access for the TV app.
 *
 * NRK's psapi only sends CORS headers for https://tv.nrk.no. Packaged Tizen
 * apps are usually allowed to make cross-origin requests to origins listed in
 * config.xml's <access>, so requests go out directly first. If that is
 * blocked (or when running in a desktop browser for development), requests are
 * retried through the small proxy in scripts/tv-server.mjs.
 */

import { settings } from "./settings";

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export class BlockedError extends Error {
  constructor(public url: string) {
    super(
      "Could not reach NRK. If this keeps happening, run `npm run serve:tv` " +
        "on a computer and enter its address under Settings → Proxy server."
    );
  }
}

/** null = unknown yet, true = direct requests work, false = need the proxy. */
let directWorks: boolean | null = null;

/** Forget what we learned about direct access (e.g. after editing the proxy URL). */
export function resetNetworkMode(): void {
  directWorks = null;
}

/** The proxy base URL in effect: the user's setting, or our own origin when served over http(s). */
export function proxyBase(): string {
  const configured = settings.proxyUrl.trim().replace(/\/+$/, "");
  if (configured) return /^https?:\/\//i.test(configured) ? configured : "http://" + configured;
  if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
  return "";
}

function viaProxy(base: string, url: string): string {
  return base + "/proxy?url=" + encodeURIComponent(url);
}

async function read(url: string, original: string): Promise<string> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new HttpError(res.status, original);
  return res.text();
}

export async function fetchText(url: string): Promise<string> {
  const proxy = proxyBase();
  const servedOverHttp = location.protocol === "http:" || location.protocol === "https:";

  // A desktop browser always enforces CORS, so go straight to the proxy there.
  if (proxy && (directWorks === false || (servedOverHttp && directWorks === null))) {
    return read(viaProxy(proxy, url), url);
  }

  try {
    const text = await read(url, url);
    directWorks = true;
    return text;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (!proxy) throw new BlockedError(url);
    directWorks = false;
    return read(viaProxy(proxy, url), url);
  }
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

/** Describe how the app is currently reaching NRK (for the Settings screen). */
export async function testConnection(): Promise<string> {
  resetNetworkMode();
  await fetchText("https://psapi.nrk.no/tv/live");
  if (directWorks) return "Connected directly to NRK.";
  return "Connected through the proxy at " + proxyBase() + ".";
}
