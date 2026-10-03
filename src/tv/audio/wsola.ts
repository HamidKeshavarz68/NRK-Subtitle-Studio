/**
 * Streaming WSOLA (waveform-similarity overlap-add) time stretcher.
 *
 * Changes the tempo of audio without changing its pitch: 30 ms Hann-windowed
 * grains are taken from the input every `hop * rate` samples and laid down every
 * `hop` samples, each grain nudged (±12 ms) to the spot where it best continues
 * the previous one so voices don't phase or warble.
 */

export class Wsola {
  /** Tempo: 0.9 plays at 90 % speed (output is longer than the input). */
  rate = 1;
  private readonly win: number;
  private readonly hop: number;
  private readonly radius: number;
  private readonly window: Float32Array;
  private input: Float32Array[];
  /** Absolute sample index of input[c][0]. */
  private inBase = 0;
  private inLen = 0;
  /** Absolute (fractional) input position of the next grain. */
  private pos = 0;
  /** Absolute start of the previous grain, or -1 before the first one. */
  private prev = -1;
  private acc: Float32Array[];
  private mono: Float32Array;

  constructor(private readonly channels: number, sampleRate: number) {
    this.hop = Math.round(sampleRate * 0.015);
    this.win = this.hop * 2;
    this.radius = Math.round(sampleRate * 0.012);
    this.window = new Float32Array(this.win);
    for (let i = 0; i < this.win; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.win);
    this.input = [];
    this.acc = [];
    for (let c = 0; c < channels; c++) {
      this.input.push(new Float32Array(sampleRate * 4));
      this.acc.push(new Float32Array(this.win));
    }
    this.mono = new Float32Array(sampleRate * 4);
  }

  /** Forget everything; the next input chunk starts at absolute sample `inputStart`, output starts at `from`. */
  reset(inputStart: number, from: number): void {
    this.inBase = inputStart;
    this.inLen = 0;
    this.pos = Math.max(from, inputStart);
    this.prev = -1;
    for (const a of this.acc) a.fill(0);
  }

  /** Continue from absolute input sample `at` (must be buffered), fading in. */
  skipTo(at: number): void {
    this.pos = at;
    this.prev = -1;
    for (const a of this.acc) a.fill(0);
  }

  /** Absolute input position the next output sample corresponds to. */
  position(): number {
    return this.pos;
  }

  /** Absolute sample index of the oldest buffered input. */
  inputStart(): number {
    return this.inBase;
  }

  /** Absolute sample index just past the buffered input. */
  inputEnd(): number {
    return this.inBase + this.inLen;
  }

  push(chunk: Float32Array[]): void {
    const n = chunk[0].length;
    this.trim();
    if (this.inLen + n > this.input[0].length) {
      const size = Math.max(this.input[0].length * 2, this.inLen + n);
      this.input = this.input.map((old) => {
        const a = new Float32Array(size);
        a.set(old.subarray(0, this.inLen));
        return a;
      });
      const m = new Float32Array(size);
      m.set(this.mono.subarray(0, this.inLen));
      this.mono = m;
    }
    for (let c = 0; c < this.channels; c++) this.input[c].set(chunk[Math.min(c, chunk.length - 1)], this.inLen);
    const mono = this.mono;
    const off = this.inLen;
    if (this.channels === 1) mono.set(chunk[0], off);
    else {
      const l = chunk[0];
      const r = chunk[1] || chunk[0];
      for (let i = 0; i < n; i++) mono[off + i] = l[i] + r[i];
    }
    this.inLen += n;
  }

  /** Drop input that no future grain can reach. */
  private trim(): void {
    const keepFrom = Math.min(this.prev >= 0 ? this.prev : Infinity, Math.floor(this.pos) - this.radius) - this.win;
    const drop = Math.min(this.inLen, keepFrom - this.inBase);
    if (drop < this.input[0].length / 2) return;
    for (const a of this.input) a.copyWithin(0, drop, this.inLen);
    this.mono.copyWithin(0, drop, this.inLen);
    this.inBase += drop;
    this.inLen -= drop;
  }

  /** Produce up to `max` output samples from the buffered input (fewer when more input is needed). */
  pull(max: number): Float32Array[] {
    const hop = this.hop;
    const win = this.win;
    const r = this.radius;
    const grains = Math.floor(max / hop);
    const out: Float32Array[] = [];
    for (let c = 0; c < this.channels; c++) out.push(new Float32Array(grains * hop));
    const end = this.inBase + this.inLen;
    let made = 0;
    while (made < grains) {
      const p = Math.round(this.pos);
      let start: number;
      if (this.prev < 0) {
        if (p + win > end) break;
        start = p;
      } else {
        const natural = this.prev + hop;
        if (p + r + win > end || natural + win > end) break;
        start = this.bestMatch(natural, Math.max(this.inBase, p - r), p + r);
      }
      const at = start - this.inBase;
      for (let c = 0; c < this.channels; c++) {
        const a = this.acc[c];
        const src = this.input[c];
        const w = this.window;
        for (let i = 0; i < win; i++) a[i] += w[i] * src[at + i];
        out[c].set(a.subarray(0, hop), made * hop);
        a.copyWithin(0, hop, win);
        a.fill(0, win - hop);
      }
      this.prev = start;
      this.pos += hop * this.rate;
      made++;
    }
    return made === grains ? out : out.map((a) => a.subarray(0, made * hop));
  }

  /** Start in [lo, hi] whose first half best matches the natural continuation at `natural`. */
  private bestMatch(natural: number, lo: number, hi: number): number {
    const m = this.mono;
    const base = this.inBase;
    const len = this.hop;
    const ref = natural - base;
    let best = lo;
    let bestScore = -Infinity;
    // Coarse pass on every 4th sample and offset, then refine around the winner.
    for (let s = lo; s <= hi; s += 4) {
      const score = this.corr(m, ref, s - base, len, 4);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const from = Math.max(lo, best - 3);
    const to = Math.min(hi, best + 3);
    bestScore = -Infinity;
    for (let s = from; s <= to; s++) {
      const score = this.corr(m, ref, s - base, len, 1);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  private corr(m: Float32Array, a: number, b: number, len: number, step: number): number {
    let xy = 0;
    let yy = 1e-9;
    for (let i = 0; i < len; i += step) {
      const y = m[b + i];
      xy += m[a + i] * y;
      yy += y * y;
    }
    return xy / Math.sqrt(yy);
  }
}
