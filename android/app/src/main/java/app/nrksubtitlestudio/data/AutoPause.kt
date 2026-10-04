package app.nrksubtitlestudio.data

/**
 * Auto pause (Kotlin port of src/shared/subtitles/autopause.ts): fed the
 * play head on every tick, it arms on the line being played and fires once
 * playback reaches that line's end. Seeks (and big jumps) disarm it, so
 * repeating a line pauses after it again.
 */
class AutoPauseDetector {
    private var armed = -1
    private var lastPaused = -1
    private var lastT = -1.0

    /** Forget the current line (call after a seek). */
    fun reset() {
        armed = -1
        lastPaused = -1
        lastT = -1.0
    }

    /** Feed the position (seconds) while playing; returns the index of the line that just ended, or -1. */
    fun check(cues: List<Cue>, t: Double): Int {
        if (lastT >= 0 && (t < lastT - 0.5 || t > lastT + JUMP)) reset()
        lastT = t
        if (armed in cues.indices && t >= cues[armed].end - LEAD) {
            val done = armed
            armed = -1
            lastPaused = done
            return done
        }
        val idx = activeLine(cues, t)
        if (idx >= 0 && idx != lastPaused && t < cues[idx].end - LEAD) armed = idx
        return -1
    }

    companion object {
        /** Fire this much before the line's end, so the next line's first syllable isn't heard. */
        const val LEAD = 0.08
        /** A jump larger than this between ticks counts as a seek. */
        const val JUMP = 2.5

        /** Index of the line being spoken at `t` (start ≤ t < end), or -1 in a gap. */
        fun activeLine(cues: List<Cue>, t: Double): Int {
            val i = Vtt.indexAt(cues, t)
            return if (i >= 0 && t < cues[i].end) i else -1
        }
    }
}

/** Setting values: 0 = off, -1 = pause until play is pressed, n = resume after n seconds. */
val AUTO_PAUSE_OPTIONS = listOf(0, -1, 2, 3, 5)

fun formatAutoPause(v: Int): String = when {
    v == 0 -> "Off"
    v < 0 -> "After each line (tap to continue)"
    else -> "After each line, resume after $v s"
}

fun formatAutoPauseShort(v: Int): String = when {
    v == 0 -> "Off"
    v < 0 -> "Each line"
    else -> "Each line · $v s"
}
