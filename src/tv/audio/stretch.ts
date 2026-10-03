/**
 * Plays a DASH AAC audio track through Web Audio at a chosen tempo, pitch kept,
 * locked to a (muted) video element's clock.
 *
 * Samsung TVs mute their own audio whenever playbackRate != 1, so for slowed
 * playback the video plays muted and this supplies the sound: segments are
 * fetched and decoded in JavaScript, time-stretched with WSOLA and scheduled
 * as short AudioBuffers. The video is the master clock; small drift is
 * absorbed by nudging the stretch ratio, large jumps (seeks, stalls) fade out
 * and realign.
 */

import { AacConfig, DashAudioTrack, decodeFrames, extractFrames, parseInit } from "./dash";
import { Wsola } from "./wsola";

export interface VideoClock {
  /** Media time, seconds. */
  time(): number;
  /** True while the picture is moving (not paused, seeking or buffering). */
  running(): boolean;
}

/** Audio scheduled ahead of the play head. */
const LEAD = 0.8;
/** Length of each scheduled AudioBuffer. */
const CHUNK = 0.2;
/** Decoded input kept ahead of the stretcher. */
const AHEAD = 12;
/** Head start given to the audio when (re)starting while the video runs. */
const START_DELAY = 0.15;
/** Beyond this drift, realign instead of nudging. */
const MAX_DRIFT = 0.12;
/** Frames of the previous segment decoded again to warm up the AAC decoder. */
const PREROLL = 2;

interface Scheduled {
  node: AudioBufferSourceNode;
  start: number;
  end: number;
  /** Media time of the first sample. */
  media: number;
  rate: number;
}

type AudioCtor = new () => AudioContext;

export function audioSupported(): boolean {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor; OfflineAudioContext?: unknown };
  return !!((w.AudioContext || w.webkitAudioContext) && w.OfflineAudioContext);
}

function fetchBuf(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";
    xhr.timeout = 20000;
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 && xhr.response ? resolve(xhr.response as ArrayBuffer) : reject(new Error("HTTP " + xhr.status)));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send();
  });
}

export class StretchedAudio {
  readonly stats = { drift: 0, buffered: 0, ahead: 0, realigns: 0, errors: 0, lastError: "", state: "loading" };
  private readonly ctx: AudioContext;
  private out: GainNode;
  private cfg: AacConfig | null = null;
  private wsola: Wsola | null = null;
  private sr = 48000;
  private rate = 1;
  private gen = 0;
  private nextSeg = 0;
  private loading = false;
  private prevFrames: Uint8Array[] = [];
  private queue: Scheduled[] = [];
  private scheduledUntil = 0;
  private aligned = false;
  /** Where the next alignment wants to start (absolute sample). */
  private want = 0;
  private lastVt = -1;
  private lastMove = 0;
  private timer: number;
  private dead = false;
  private failures = 0;
  private retryAt = 0;

  /** `onFatal` fires once if the audio track can't be played at all. */
  constructor(private readonly track: DashAudioTrack, private readonly video: VideoClock, private readonly onFatal: (why: string) => void) {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = (w.AudioContext || w.webkitAudioContext) as AudioCtor;
    this.ctx = new Ctor();
    this.out = this.newOutput();
    fetchBuf(track.initUrl)
      .then((buf) => {
        if (this.dead) return;
        const cfg = parseInit(buf);
        if (!cfg) throw new Error("unsupported audio format");
        this.cfg = cfg;
        this.sr = cfg.sampleRate;
        this.wsola = new Wsola(cfg.channels, cfg.sampleRate);
        this.wsola.rate = this.rate;
        this.restartLoader(this.video.time());
        this.tick();
      })
      .catch((e) => this.fatal(e));
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  setRate(rate: number): void {
    if (rate === this.rate) return;
    this.rate = rate;
    if (this.wsola) this.wsola.rate = rate;
    this.realign();
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.gen++;
    window.clearInterval(this.timer);
    this.stopQueue(0);
    try {
      void this.ctx.close();
    } catch {
      // ignore
    }
  }

  private fatal(e: unknown): void {
    if (this.dead) return;
    this.stats.lastError = e instanceof Error ? e.message : String(e);
    this.stats.state = "failed";
    const why = this.stats.lastError;
    this.destroy();
    this.onFatal(why);
  }

  private newOutput(): GainNode {
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    return g;
  }

  /** Fade out and drop everything scheduled; new audio goes to a fresh output. */
  private stopQueue(fade: number): void {
    const old = this.out;
    const now = this.ctx.currentTime;
    try {
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + fade);
    } catch {
      // ignore
    }
    for (const s of this.queue) {
      try {
        s.node.stop(now + fade);
      } catch {
        // ignore
      }
    }
    this.queue = [];
    window.setTimeout(() => {
      try {
        old.disconnect();
      } catch {
        // ignore
      }
    }, fade * 1000 + 100);
    if (!this.dead) this.out = this.newOutput();
  }

  private realign(): void {
    if (this.aligned) this.stats.realigns++;
    this.aligned = false;
    this.stopQueue(0.03);
  }

  private segIndexAt(sample: number): number {
    const segs = this.track.segments;
    const k = this.sr / this.track.timescale;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].t * k <= sample) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private restartLoader(t: number): void {
    if (!this.wsola) return;
    this.gen++;
    const target = Math.max(0, Math.round(t * this.sr));
    const i = this.segIndexAt(target);
    this.nextSeg = i;
    this.prevFrames = [];
    this.wsola.reset(Math.round((this.track.segments[i].t * this.sr) / this.track.timescale), target);
    this.load();
  }

  private load(): void {
    const w = this.wsola;
    const cfg = this.cfg;
    if (this.loading || !w || !cfg || this.dead || Date.now() < this.retryAt) return;
    const from = this.aligned ? w.position() : Math.max(w.position(), this.want);
    if ((w.inputEnd() - from) / this.sr > AHEAD || this.nextSeg >= this.track.segments.length) return;
    const gen = this.gen;
    const seg = this.track.segments[this.nextSeg];
    this.loading = true;
    fetchBuf(seg.url)
      .then((buf) => {
        if (gen !== this.gen || this.dead) return null;
        const frames = extractFrames(buf, cfg);
        if (!frames.length) throw new Error("empty audio segment");
        const pre = this.prevFrames;
        return decodeFrames(pre.concat(frames), pre.length, cfg).then((pcm) => {
          if (gen !== this.gen || this.dead) return;
          w.push(pcm);
          this.prevFrames = frames.slice(-PREROLL);
          this.nextSeg++;
          this.failures = 0;
        });
      })
      .catch((e) => {
        this.stats.errors++;
        this.stats.lastError = e instanceof Error ? e.message : String(e);
        // Give up only if nothing ever worked; otherwise keep retrying.
        if (++this.failures >= 4 && this.stats.state === "loading") this.fatal(e);
        else this.retryAt = Date.now() + 1000 * Math.min(8, this.failures);
      })
      .then(() => {
        this.loading = false;
        if (gen === this.gen) this.tick();
      });
  }

  /** Media time being played right now, or null if nothing is playing. */
  private audioTime(): number | null {
    const now = this.ctx.currentTime;
    for (const s of this.queue) if (s.start <= now && now < s.end) return s.media + (now - s.start) * s.rate;
    return null;
  }

  private tick(): void {
    const w = this.wsola;
    if (this.dead || !w) return;
    const vt = this.video.time();
    const wall = Date.now();
    if (vt !== this.lastVt) {
      this.lastVt = vt;
      this.lastMove = wall;
    }
    // Some TVs report "playing" for a few seconds before the picture moves.
    const running = this.video.running() && wall - this.lastMove < 400;
    const ctx = this.ctx;
    try {
      if (!running && ctx.state === "running") void ctx.suspend();
      else if (running && ctx.state === "suspended") void ctx.resume();
    } catch {
      // ignore
    }
    const now = ctx.currentTime;
    this.queue = this.queue.filter((s) => s.end > now - 0.5);

    if (this.aligned) {
      const at = this.audioTime();
      if (at === null) {
        // Ran dry (slow network); start over where the video is.
        if (running && this.scheduledUntil <= now) this.realign();
      } else {
        const drift = at - vt;
        this.stats.drift = drift;
        if (Math.abs(drift) > MAX_DRIFT) this.realign();
        else if (Math.abs(drift) > 0.015) w.rate = this.rate * (1 - Math.max(-0.04, Math.min(0.04, drift * 0.5)));
        else w.rate = this.rate;
      }
    }

    if (!this.aligned) {
      const delay = running ? START_DELAY : 0;
      const target = Math.round((vt + delay * this.rate) * this.sr);
      this.want = target;
      if (target >= w.inputStart() && target + this.sr * 0.5 <= w.inputEnd()) {
        w.skipTo(target);
        w.rate = this.rate;
        this.scheduledUntil = now + delay;
        this.aligned = true;
        this.stats.state = "playing";
      } else if (target < w.inputStart() || target > w.inputEnd() + this.sr * 6) {
        this.restartLoader(target / this.sr);
      }
    }

    if (this.aligned) this.schedule();
    this.load();
    this.stats.buffered = (w.inputEnd() - w.position()) / this.sr;
    this.stats.ahead = this.scheduledUntil - now;
  }

  private schedule(): void {
    const w = this.wsola!;
    const ctx = this.ctx;
    const ch = this.cfg!.channels;
    if (this.scheduledUntil < ctx.currentTime) this.scheduledUntil = ctx.currentTime + 0.02;
    while (this.scheduledUntil - ctx.currentTime < LEAD) {
      const media = w.position() / this.sr;
      const rate = w.rate;
      const pcm = w.pull(Math.round(CHUNK * this.sr));
      const len = pcm[0].length;
      if (!len) break;
      const buf = ctx.createBuffer(ch, len, this.sr);
      for (let c = 0; c < ch; c++) buf.getChannelData(c).set(pcm[c]);
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(this.out);
      const start = this.scheduledUntil;
      node.start(start);
      this.scheduledUntil = start + len / this.sr;
      this.queue.push({ node, start, end: this.scheduledUntil, media, rate });
    }
  }
}
