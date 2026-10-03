/**
 * Just enough DASH + fMP4 handling to decode NRK's separate AAC audio track in
 * JavaScript: find the audio representation in the MPD, pull the raw AAC frames
 * out of each fragment, wrap them in ADTS headers and let Web Audio decode them.
 */

export interface AudioSegment {
  /** Start, in timescale units. */
  t: number;
  /** Duration, in timescale units. */
  d: number;
  url: string;
}

export interface DashAudioTrack {
  initUrl: string;
  timescale: number;
  segments: AudioSegment[];
}

function attr(el: Element | null, name: string): string {
  return (el && el.getAttribute(name)) || "";
}

function child(el: Element, tag: string): Element | null {
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === tag) return c;
  return null;
}

function children(el: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === tag) out.push(c);
  return out;
}

function resolveBase(base: string, el: Element | null): string {
  const b = el && child(el, "BaseURL");
  const text = b && b.textContent ? b.textContent.trim() : "";
  return text ? new URL(text, base).href : base;
}

function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\$(\w*)(?:%0(\d+)d)?\$/g, (m, name: string, width?: string) => {
    if (!name) return "$";
    const v = vars[name];
    if (v === undefined) return m;
    let s = String(v);
    if (width) while (s.length < +width) s = "0" + s;
    return s;
  });
}

function isoDuration(s: string): number {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) return NaN;
  return +(m[1] || 0) * 86400 + +(m[2] || 0) * 3600 + +(m[3] || 0) * 60 + +(m[4] || 0);
}

/** The AAC-LC audio track of a static (on-demand) MPD, or null when there isn't a usable one. */
export function parseDashAudio(xml: string, mpdUrl: string): DashAudioTrack | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const mpd = doc.documentElement;
  if (!mpd || mpd.localName !== "MPD" || attr(mpd, "type") === "dynamic") return null;
  const period = child(mpd, "Period");
  if (!period) return null;
  const base0 = resolveBase(resolveBase(mpdUrl, mpd), period);

  for (const set of children(period, "AdaptationSet")) {
    const setMime = attr(set, "mimeType") || attr(set, "contentType");
    for (const rep of children(set, "Representation")) {
      const mime = attr(rep, "mimeType") || setMime;
      const codecs = attr(rep, "codecs") || attr(set, "codecs");
      if (mime.indexOf("audio") !== 0 || !/^mp4a\.40\.2$/i.test(codecs)) continue;
      if (child(rep, "ContentProtection") || child(set, "ContentProtection")) continue;
      const tpl = child(rep, "SegmentTemplate") || child(set, "SegmentTemplate");
      if (!tpl) continue;
      const base = resolveBase(resolveBase(base0, set), rep);
      const vars: Record<string, string | number> = { RepresentationID: attr(rep, "id"), Bandwidth: attr(rep, "bandwidth") };
      const timescale = +attr(tpl, "timescale") || 1;
      const media = attr(tpl, "media");
      const init = attr(tpl, "initialization");
      if (!media || !init) continue;
      const startNumber = attr(tpl, "startNumber") ? +attr(tpl, "startNumber") : 1;
      const segments: AudioSegment[] = [];
      const add = (t: number, d: number): void => {
        const n = startNumber + segments.length;
        segments.push({ t, d, url: new URL(fillTemplate(media, { ...vars, Time: t, Number: n }), base).href });
      };
      const timeline = child(tpl, "SegmentTimeline");
      if (timeline) {
        let t = 0;
        for (const s of children(timeline, "S")) {
          if (attr(s, "t")) t = +attr(s, "t");
          const d = +attr(s, "d");
          const r = +attr(s, "r") || 0;
          if (!(d > 0) || r < 0) return null;
          for (let i = 0; i <= r; i++) {
            add(t, d);
            t += d;
          }
        }
      } else {
        const d = +attr(tpl, "duration");
        const total = isoDuration(attr(mpd, "mediaPresentationDuration"));
        if (!(d > 0) || !(total > 0)) continue;
        for (let t = 0; t < total * timescale; t += d) add(t, d);
      }
      if (!segments.length) continue;
      return { initUrl: new URL(fillTemplate(init, vars), base).href, timescale, segments };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ fMP4 */

interface Box {
  type: string;
  start: number;
  /** First byte of the payload. */
  body: number;
  end: number;
}

function boxes(v: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = String.fromCharCode(v.getUint8(o + 4), v.getUint8(o + 5), v.getUint8(o + 6), v.getUint8(o + 7));
    let body = o + 8;
    if (size === 1) {
      size = v.getUint32(o + 8) * 4294967296 + v.getUint32(o + 12);
      body = o + 16;
    } else if (size === 0) size = end - o;
    if (size < 8 || o + size > end) break;
    out.push({ type, start: o, body, end: o + size });
    o += size;
  }
  return out;
}

function find(v: DataView, start: number, end: number, path: string[]): Box | null {
  let box: Box | null = null;
  let s = start;
  let e = end;
  for (const type of path) {
    box = null;
    for (const b of boxes(v, s, e)) {
      if (b.type === type) {
        box = b;
        break;
      }
    }
    if (!box) return null;
    s = box.body;
    e = box.end;
  }
  return box;
}

export interface AacConfig {
  /** MPEG-4 audio object type (2 = AAC-LC). */
  objectType: number;
  freqIndex: number;
  channels: number;
  sampleRate: number;
  /** Default sample (frame) size from `trex`, used when a fragment doesn't say. */
  defaultSize: number;
}

const FREQS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Read the AAC decoder config (from `esds`) out of an init segment. */
export function parseInit(buf: ArrayBuffer): AacConfig | null {
  const v = new DataView(buf);
  const stsd = find(v, 0, buf.byteLength, ["moov", "trak", "mdia", "minf", "stbl", "stsd"]);
  if (!stsd) return null;
  // stsd: version/flags + entry count, then the sample entry.
  const entry = boxes(v, stsd.body + 8, stsd.end)[0];
  if (!entry || entry.type !== "mp4a") return null;
  // AudioSampleEntry: 8 bytes SampleEntry + 20 bytes audio fields.
  const esds = find(v, entry.body + 28, entry.end, ["esds"]);
  if (!esds) return null;
  const bytes = new Uint8Array(buf, esds.body + 4, esds.end - esds.body - 4);
  const asc = findDescriptor(bytes, 0x05);
  if (!asc || asc.length < 2) return null;
  const objectType = asc[0] >> 3;
  const freqIndex = ((asc[0] & 7) << 1) | (asc[1] >> 7);
  const channels = (asc[1] >> 3) & 15;
  if (objectType !== 2 || freqIndex >= FREQS.length || channels < 1 || channels > 2) return null;
  let defaultSize = 0;
  const trex = find(v, 0, buf.byteLength, ["moov", "mvex", "trex"]);
  if (trex) defaultSize = v.getUint32(trex.body + 16);
  return { objectType, freqIndex, channels, sampleRate: FREQS[freqIndex], defaultSize };
}

/** Find an MPEG-4 descriptor by tag inside an `esds` payload (ES_Descriptor > DecoderConfig > DSI). */
function findDescriptor(b: Uint8Array, want: number): Uint8Array | null {
  let o = 0;
  while (o < b.length) {
    const tag = b[o++];
    let len = 0;
    for (let i = 0; i < 4 && o < b.length; i++) {
      const c = b[o++];
      len = (len << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    if (tag === want) return b.subarray(o, o + len);
    if (tag === 0x03) {
      // ES_Descriptor: ES_ID(2) + flags(1) [+ optional fields], then nested descriptors.
      const flags = b[o + 2];
      let skip = 3;
      if (flags & 0x80) skip += 2;
      if (flags & 0x40) skip += 1 + b[o + skip];
      if (flags & 0x20) skip += 2;
      o += skip;
    } else if (tag === 0x04) {
      o += 13; // objectType, streamType, bufferSize(3), maxBitrate(4), avgBitrate(4), then nested.
    } else {
      o += len;
    }
  }
  return null;
}

/** The raw AAC frames of one media segment (moof + mdat). */
export function extractFrames(buf: ArrayBuffer, cfg: AacConfig): Uint8Array[] {
  const v = new DataView(buf);
  const out: Uint8Array[] = [];
  for (const moof of boxes(v, 0, buf.byteLength)) {
    if (moof.type !== "moof") continue;
    for (const traf of boxes(v, moof.body, moof.end)) {
      if (traf.type !== "traf") continue;
      let baseOffset = moof.start;
      let defaultSize = cfg.defaultSize;
      for (const b of boxes(v, traf.body, traf.end)) {
        if (b.type === "tfhd") {
          const flags = v.getUint32(b.body) & 0xffffff;
          let o = b.body + 8;
          if (flags & 0x1) {
            baseOffset = v.getUint32(o) * 4294967296 + v.getUint32(o + 4);
            o += 8;
          }
          if (flags & 0x2) o += 4;
          if (flags & 0x8) o += 4;
          if (flags & 0x10) defaultSize = v.getUint32(o);
        } else if (b.type === "trun") {
          const flags = v.getUint32(b.body) & 0xffffff;
          const count = v.getUint32(b.body + 4);
          let o = b.body + 8;
          let data = baseOffset;
          if (flags & 0x1) {
            data += v.getInt32(o);
            o += 4;
          }
          if (flags & 0x4) o += 4;
          for (let i = 0; i < count; i++) {
            if (flags & 0x100) o += 4;
            let size = defaultSize;
            if (flags & 0x200) {
              size = v.getUint32(o);
              o += 4;
            }
            if (flags & 0x400) o += 4;
            if (flags & 0x800) o += 4;
            if (!(size > 0) || data + size > buf.byteLength) return out;
            out.push(new Uint8Array(buf, data, size));
            data += size;
          }
        }
      }
    }
  }
  return out;
}

/** Wrap raw AAC-LC frames in ADTS headers so `decodeAudioData` can read them. */
export function toAdts(frames: Uint8Array[], cfg: AacConfig): ArrayBuffer {
  let total = 0;
  for (const f of frames) total += f.length + 7;
  const out = new Uint8Array(total);
  let o = 0;
  const profile = cfg.objectType - 1;
  for (const f of frames) {
    const len = f.length + 7;
    out[o] = 0xff;
    out[o + 1] = 0xf1;
    out[o + 2] = ((profile & 3) << 6) | ((cfg.freqIndex & 15) << 2) | ((cfg.channels >> 2) & 1);
    out[o + 3] = ((cfg.channels & 3) << 6) | ((len >> 11) & 3);
    out[o + 4] = (len >> 3) & 0xff;
    out[o + 5] = ((len & 7) << 5) | 0x1f;
    out[o + 6] = 0xfc;
    out.set(f, o + 7);
    o += len;
  }
  return out.buffer;
}

export const AAC_FRAME = 1024;

type OfflineCtor = new (channels: number, length: number, rate: number) => OfflineAudioContext;
let decoder: OfflineAudioContext | null = null;
let decoderKey = "";

/** Last decode: how many samples the decoder returned vs. how many the frames hold. */
export const decodeInfo = { got: 0, want: 0 };

/**
 * Decode AAC frames to PCM at the stream's own sample rate. The first `preroll`
 * frames only warm up the decoder (AAC frames overlap their neighbours) and are
 * dropped; the result is exactly `(frames.length - preroll) * 1024` samples.
 */
export function decodeFrames(frames: Uint8Array[], preroll: number, cfg: AacConfig): Promise<Float32Array[]> {
  const key = cfg.channels + "/" + cfg.sampleRate;
  if (!decoder || decoderKey !== key) {
    const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
    const Ctor = w.OfflineAudioContext || w.webkitOfflineAudioContext;
    if (!Ctor) return Promise.reject(new Error("Web Audio is not available"));
    decoder = new Ctor(cfg.channels, 1, cfg.sampleRate);
    decoderKey = key;
  }
  const ctx = decoder;
  const want = (frames.length - preroll) * AAC_FRAME;
  return new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(toAdts(frames, cfg), resolve, (e) => reject(e || new Error("decode failed")));
    if (p && typeof p.catch === "function") p.catch(reject);
  }).then((ab) => {
    decodeInfo.got = ab.length;
    decodeInfo.want = frames.length * AAC_FRAME;
    const out: Float32Array[] = [];
    for (let c = 0; c < cfg.channels; c++) {
      const src = ab.getChannelData(Math.min(c, ab.numberOfChannels - 1));
      const ch = new Float32Array(want);
      // Decoders may drop a little from the start (codec delay), not from the
      // end, so align on the end.
      const n = Math.min(want, src.length);
      ch.set(src.subarray(src.length - n), want - n);
      out.push(ch);
    }
    return out;
  });
}
