package app.nrksubtitlestudio.data

/** Minimal WebVTT parsing (port of src/shared/subtitles/vtt.ts). */
object Vtt {
    private val ENTITIES = mapOf(
        "&amp;" to "&", "&lt;" to "<", "&gt;" to ">", "&quot;" to "\"",
        "&#39;" to "'", "&apos;" to "'", "&nbsp;" to " ",
    )
    private val TAG = Regex("<[^>]+>")
    private val DEC = Regex("&#(\\d+);")
    private val HEX = Regex("&#x([0-9a-fA-F]+);")
    private val NAMED = Regex("&[a-zA-Z]+;")
    private val TIME = Regex("(?:(\\d+):)?(\\d{1,2}):(\\d{2})[.,](\\d{1,3})")

    private fun decode(s: String): String = s
        .replace(DEC) { String(Character.toChars(it.groupValues[1].toInt())) }
        .replace(HEX) { String(Character.toChars(it.groupValues[1].toInt(16))) }
        .replace(NAMED) { ENTITIES[it.value] ?: it.value }

    fun seconds(ts: String): Double {
        val m = TIME.find(ts.trim()) ?: return Double.NaN
        val h = m.groupValues[1].ifEmpty { "0" }.toInt()
        val min = m.groupValues[2].toInt()
        val sec = m.groupValues[3].toInt()
        val ms = m.groupValues[4].padEnd(3, '0').toInt()
        return h * 3600.0 + min * 60 + sec + ms / 1000.0
    }

    fun parse(input: String): List<Cue> {
        val lines = input.replace("\r\n", "\n").replace('\r', '\n').split('\n')
        val cues = ArrayList<Cue>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val arrow = line.indexOf("-->")
            if (arrow == -1) {
                i++
                continue
            }
            val start = seconds(line.substring(0, arrow))
            val end = seconds(line.substring(arrow + 3).trim().split(Regex("\\s+")).firstOrNull() ?: "")
            i++
            val text = StringBuilder()
            while (i < lines.size && lines[i].isNotBlank()) {
                if (text.isNotEmpty()) text.append('\n')
                text.append(lines[i])
                i++
            }
            val clean = decode(text.toString().replace(TAG, "")).trim()
            if (clean.isNotEmpty() && !start.isNaN() && !end.isNaN()) cues.add(Cue(start, end, clean))
        }
        return cues
    }

    /** Index of the last cue starting at or before `t`, or -1. */
    fun indexAt(cues: List<Cue>, t: Double): Int {
        var lo = 0
        var hi = cues.size - 1
        var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (cues[mid].start <= t) {
                ans = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return ans
    }
}
