/**
 * Auto pause: stop playback at the end of every subtitle line so it can be read
 * (and optionally carry on by itself after a few seconds). Shared by the Chrome
 * extension and the Samsung TV app; the Android app has a Kotlin port.
 *
 * The detector is fed the current time on every tick. It "arms" on the line
 * being played and fires once playback reaches that line's end. Seeks (and big
 * jumps in time) disarm it, so repeating a line pauses after it again.
 */

/** Setting value: 0 = off, -1 = pause until play is pressed, n > 0 = resume after n seconds. */
export type AutoPauseSetting = number;

export const AUTO_PAUSE_OFF = 0;
export const AUTO_PAUSE_WAIT = -1;
/** Values offered in the settings, in display order. */
export const AUTO_PAUSE_OPTIONS: AutoPauseSetting[] = [0, -1, 2, 3, 5];

export function isAutoPauseSetting(v: unknown): v is AutoPauseSetting {
  return typeof v === "number" && AUTO_PAUSE_OPTIONS.indexOf(v) !== -1;
}

export interface TimedLine {
  start: number;
  end: number;
}

/** Fire this much before the line's end, so the next line's first syllable isn't heard. */
const LEAD = 0.08;
/** A jump in time larger than this between ticks counts as a seek. */
const JUMP = 2.5;

export class AutoPauseDetector {
  private armed = -1;
  private lastPaused = -1;
  private lastT = -1;

  /** Forget the current line (call after a seek). */
  reset(): void {
    this.armed = -1;
    this.lastPaused = -1;
    this.lastT = -1;
  }

  /**
   * Feed the playback position (seconds) while playing. Returns the index of
   * the line that just finished, i.e. "pause now", or -1.
   */
  check(lines: ArrayLike<TimedLine>, t: number): number {
    if (this.lastT >= 0 && (t < this.lastT - 0.5 || t > this.lastT + JUMP)) this.reset();
    this.lastT = t;

    if (this.armed >= 0 && this.armed < lines.length && t >= lines[this.armed].end - LEAD) {
      const done = this.armed;
      this.armed = -1;
      this.lastPaused = done;
      return done;
    }

    const idx = activeLine(lines, t);
    if (idx >= 0 && idx !== this.lastPaused && t < lines[idx].end - LEAD) this.armed = idx;
    return -1;
  }
}

/** Index of the line being spoken at `t` (start ≤ t < end), or -1 in a gap. */
export function activeLine(lines: ArrayLike<TimedLine>, t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 && t < lines[ans].end ? ans : -1;
}
