/**
 * Thin, defensive client for NRK's public psapi endpoints (the same ones the
 * tv.nrk.no website uses). Only the fields the TV app needs are extracted.
 */

import { fetchJson, fetchText } from "./net";
import { parseVtt, type SubtitleCue } from "../shared/subtitles/vtt";

const PSAPI = "https://psapi.nrk.no";

export type CardKind = "series" | "program" | "channel";

export interface Card {
  kind: CardKind;
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  meta?: string;
}

export interface Row {
  title: string;
  cards: Card[];
}

export interface Season {
  title: string;
  href: string;
}

export interface SeriesInfo {
  id: string;
  type: string;
  title: string;
  description: string;
  image?: string;
  backdrop?: string;
  seasons: Season[];
}

export interface SubtitleTrack {
  language: string;
  label: string;
  type: string;
  url: string;
  defaultOn: boolean;
}

export interface Stream {
  url: string;
  format: "hls" | "dash";
}

export interface Playback {
  id: string;
  kind: "program" | "channel";
  title: string;
  subtitle: string;
  /** Playable streams in NRK's order of preference (plus derived fallbacks). */
  streams: Stream[];
  isLive: boolean;
  subtitles: SubtitleTrack[];
}

/** A playback error with a user-facing message from NRK when available. */
export class NotPlayableError extends Error {}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Pick the image closest to (but not below) `want` px wide from any NRK image list shape. */
export function pickImage(list: unknown, want = 600): string | undefined {
  let best: { url: string; w: number } | undefined;
  for (const item of asArr(list)) {
    if (!isObj(item)) continue;
    const url = asStr(item.uri) || asStr(item.url) || asStr(item.imageUrl);
    const w = Number(item.width ?? item.pixelWidth ?? 0);
    if (!url) continue;
    if (
      !best ||
      (best.w < want && w > best.w) ||
      (w >= want && w < best.w)
    ) {
      best = { url, w };
    }
  }
  return best?.url;
}

const PROGRAM_ID_RE = /^[A-Za-z]{2,6}\d{6,}$/;

function plugToCard(plug: Json): Card | null {
  const dcc = isObj(plug.displayContractContent) ? plug.displayContractContent : {};
  const title = asStr(dcc.contentTitle);
  const image =
    pickImage(get(dcc, "displayContractImage.webImages")) ||
    pickImage(get(dcc, "backdropImage.webImages")) ||
    pickImage(get(dcc, "fallbackImage.webImages"));
  const subtitle = asStr(dcc.description);
  const type = asStr(plug.targetType);

  if (type === "series" || type === "podcast") {
    const id = asStr(get(plug, "series.seriesId"));
    return id && type === "series" ? { kind: "series", id, title, subtitle, image } : null;
  }
  if (type === "episode" || type === "standaloneProgram" || type === "program") {
    const id =
      asStr(get(plug, "episode.programId")) ||
      asStr(get(plug, "standaloneProgram.programId")) ||
      asStr(get(plug, "program.programId"));
    return id ? { kind: "program", id, title, subtitle, image } : null;
  }
  if (type === "channel") {
    const id = asStr(get(plug, "channel.channelId"));
    return id ? { kind: "channel", id, title, subtitle, image } : null;
  }
  return null;
}

/** The tv.nrk.no front page as rows of cards. */
export async function getFrontpage(): Promise<Row[]> {
  const page = await fetchJson(`${PSAPI}/tv/pages/frontpage`);
  const rows: Row[] = [];
  for (const section of asArr(get(page, "sections"))) {
    const included = get(section, "included");
    if (!isObj(included)) continue;
    const cards = asArr(included.plugs)
      .map((p) => (isObj(p) ? plugToCard(p) : null))
      .filter((c): c is Card => !!c);
    if (!cards.length) continue;
    const title = asStr(included.title).trim() || (cards.length === 1 ? cards[0].title : "Utvalgt");
    // Merge consecutive single-item "hero" sections into one row.
    const prev = rows[rows.length - 1];
    if (cards.length === 1 && prev && prev.title === "Utvalgt") {
      prev.cards.push(cards[0]);
    } else {
      rows.push({ title: cards.length === 1 ? "Utvalgt" : title, cards });
    }
  }
  return rows;
}

/** Live channels (NRK1, NRK2, NRK3, Super, …). */
export async function getChannels(): Promise<Card[]> {
  const data = await fetchJson(`${PSAPI}/tv/live`);
  return asArr(data)
    .map((ch): Card | null => {
      const id = asStr(get(ch, "id"));
      const pb = get(ch, "_embedded.playback");
      const title = asStr(get(pb, "title")) || id.toUpperCase();
      const posters = asArr(get(pb, "posters"));
      const image = pickImage(get(posters[0], "image.items"));
      return id ? { kind: "channel", id, title, image } : null;
    })
    .filter((c): c is Card => !!c);
}

export async function search(query: string): Promise<Card[]> {
  const data = await fetchJson(`${PSAPI}/search?q=${encodeURIComponent(query)}&pageSize=40`);
  const out: Card[] = [];
  const seen: Record<string, boolean> = {};
  for (const h of asArr(get(data, "hits"))) {
    const type = asStr(get(h, "type"));
    const hit = get(h, "hit");
    if (!isObj(hit)) continue;
    const url = asStr(hit.url);
    const lastSeg = url.split("/").filter(Boolean).pop() || "";
    let card: Card | null = null;
    const image = pickImage(get(hit, "image.webImages"));
    const title = asStr(hit.title);
    const subtitle = asStr(hit.description);
    if (type === "serie" || type === "series") {
      const id = asStr(hit.seriesId) || lastSeg;
      if (id) card = { kind: "series", id, title, subtitle, image };
    } else if (type === "program" || type === "episode") {
      const id = PROGRAM_ID_RE.test(asStr(hit.id)) ? asStr(hit.id) : lastSeg;
      if (PROGRAM_ID_RE.test(id)) card = { kind: "program", id, title, subtitle, image };
    }
    if (card && !seen[card.kind + card.id]) {
      seen[card.kind + card.id] = true;
      out.push(card);
    }
  }
  return out;
}

export async function getSeries(id: string): Promise<SeriesInfo> {
  const s = await fetchJson(`${PSAPI}/tv/catalog/series/${encodeURIComponent(id)}`);
  const type = asStr(get(s, "seriesType"));
  const body = (isObj(s) && (s[type] || s.sequential || s.standard || s.news)) || {};
  const seasons = asArr(get(s, "_links.seasons"))
    .map((l): Season | null => {
      const href = asStr(get(l, "href"));
      const title = asStr(get(l, "title")) || asStr(get(l, "name"));
      return href ? { href, title } : null;
    })
    .filter((x): x is Season => !!x);
  return {
    id,
    type,
    title: asStr(get(body, "titles.title")) || id,
    description: asStr(get(body, "titles.subtitle")),
    image: pickImage(get(body, "image")),
    backdrop: pickImage(get(body, "backdropImage"), 1280) || pickImage(get(body, "image"), 1280),
    seasons,
  };
}

/** Available episodes in a season (`href` comes from {@link SeriesInfo.seasons}). */
export async function getEpisodes(href: string): Promise<Card[]> {
  const season = await fetchJson(PSAPI + href);
  const list = asArr(get(season, "_embedded.episodes")).concat(
    asArr(get(season, "_embedded.instalments"))
  );
  return list
    .map((ep): Card | null => {
      const id = asStr(get(ep, "prfId"));
      if (!id || asStr(get(ep, "availability.status")) !== "available") return null;
      return {
        kind: "program",
        id,
        title: asStr(get(ep, "titles.title")),
        subtitle: asStr(get(ep, "titles.subtitle")),
        image: pickImage(get(ep, "image")),
        meta: asStr(get(ep, "durationDisplayValue")),
      };
    })
    .filter((c): c is Card => !!c);
}

/** Resolve the stream URL, subtitle tracks and title for a programme or channel. */
export async function getPlayback(kind: "program" | "channel", id: string): Promise<Playback> {
  const base = `${PSAPI}/playback`;
  const [manifest, metadata] = await Promise.all([
    fetchJson(`${base}/manifest/${kind}/${encodeURIComponent(id)}`),
    fetchJson(`${base}/metadata/${kind}/${encodeURIComponent(id)}`).catch(() => null),
  ]);

  if (asStr(get(manifest, "playability")) !== "playable") {
    const msg =
      asStr(get(manifest, "nonPlayable.endUserMessage")) ||
      asStr(get(metadata, "nonPlayable.endUserMessage")) ||
      "This programme can't be played right now.";
    throw new NotPlayableError(msg);
  }

  const streams = pickStreams(asArr(get(manifest, "playable.assets")));
  if (!streams.length) throw new NotPlayableError("No supported stream was found for this programme.");

  const subtitles = asArr(get(manifest, "playable.subtitles"))
    .map((s): SubtitleTrack | null => {
      const url = asStr(get(s, "webVtt"));
      return url
        ? {
            url,
            language: asStr(get(s, "language")),
            label: asStr(get(s, "label")),
            type: asStr(get(s, "type")),
            defaultOn: get(s, "defaultOn") === true,
          }
        : null;
    })
    .filter((s): s is SubtitleTrack => !!s);

  return {
    id,
    kind,
    title: asStr(get(metadata, "preplay.titles.title")) || id,
    subtitle: asStr(get(metadata, "preplay.titles.subtitle")),
    streams,
    isLive: asStr(get(manifest, "streamingMode")) === "live",
    subtitles,
  };
}

/**
 * Unencrypted or AES-128 ("statickey") HLS/DASH assets; DRM streams are skipped.
 * NRK gives Smart-TV user agents DASH for on-demand content, but the same CDN path
 * also serves HLS, so an HLS twin is added as a fallback for plain <video>.
 */
export function pickStreams(assets: unknown[]): Stream[] {
  const out: Stream[] = [];
  const seen: Record<string, boolean> = {};
  const add = (url: string, format: "hls" | "dash"): void => {
    if (!seen[url]) {
      seen[url] = true;
      out.push({ url, format });
    }
  };
  for (const a of assets) {
    const url = asStr(get(a, "url"));
    const scheme = (asStr(get(a, "encryptionScheme")) || "none").toLowerCase();
    if (!url || (scheme !== "none" && scheme !== "statickey")) continue;
    const fmt = asStr(get(a, "format")).toLowerCase();
    const mime = asStr(get(a, "mimeType")).toLowerCase();
    if (fmt === "hls" || mime.indexOf("mpegurl") >= 0 || /\.m3u8(\?|$)/.test(url)) add(url, "hls");
    else if (fmt === "dash" || mime.indexOf("dash") >= 0 || /\.mpd(\?|$)/.test(url)) add(url, "dash");
  }
  for (const s of out.slice()) {
    if (s.format === "dash" && /\/dash\.mpd(\?|$)/.test(s.url)) {
      let hls = s.url.replace(/\/dash\.mpd(\?|$)/, "/muxed.m3u8$1");
      if (!/[?&]aco=/.test(hls)) hls += (hls.indexOf("?") >= 0 ? "&" : "?") + "aco=aac";
      add(hls, "hls");
    }
  }
  return out;
}

/** Prefer the default-on track, then any Norwegian non-SDH track, then the first one. */
export function pickSubtitleTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  return (
    tracks.filter((t) => t.defaultOn)[0] ||
    tracks.filter((t) => t.type === "nor")[0] ||
    tracks[0] ||
    null
  );
}

export async function loadCues(track: SubtitleTrack): Promise<SubtitleCue[]> {
  return parseVtt(await fetchText(track.url));
}
