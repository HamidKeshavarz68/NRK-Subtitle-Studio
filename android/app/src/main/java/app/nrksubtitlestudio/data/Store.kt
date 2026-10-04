package app.nrksubtitlestudio.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

data class Settings(
    /** BCP-47 base code, or "off" to disable translation. */
    val targetLang: String = "en",
    val displayMode: String = "bilingual",
    val layout: String = "side",
    /** Subtitle text size in sp. */
    val fontSize: Int = 20,
    val playbackRate: Float = 1f,
    /** Opacity (%) of the box behind captions drawn over the picture. */
    val subtitleBg: Int = 75,
    /** 0 = off, -1 = pause after each line until play, n = resume after n seconds. */
    val autoPause: Int = 0,
    /** Optional DeepL API key; empty = Google Translate. */
    val deeplKey: String = "",
)

data class Favorite(val kind: CardKind, val id: String, val title: String, val subtitle: String = "", val image: String? = null) {
    fun toCard() = Card(kind, id, title, subtitle, image)
}

/**
 * Watch progress for a programme: where the viewer stopped and whether they
 * finished it (same rules as the TV app's progress.ts).
 */
data class Progress(val t: Double, val d: Double, val done: Boolean, val at: Long) {
    val fraction: Float get() = if (d > 0) (t / d).toFloat().coerceIn(0f, 1f) else 0f

    companion object {
        /** Positions before this aren't worth resuming from (or recording). */
        const val MIN_START = 30.0

        /** Finished = into the end credits: 95 % watched, or less than a minute left of a longer programme. */
        fun isFinished(t: Double, d: Double): Boolean = d > 0 && (t >= d * 0.95 || (d >= 600 && d - t <= 60))

        /** "23 min left", "✓ Watched", "Started" or "" when not started. */
        fun label(p: Progress?): String = when {
            p == null -> ""
            p.done -> "✓ Watched"
            p.d > 0 -> "${maxOf(1, Math.round((p.d - p.t) / 60).toInt())} min left"
            else -> "Started"
        }

        /** Where to start: the saved position, or 0 when new or finished. */
        fun resumePoint(p: Progress?): Double {
            if (p == null || p.done || p.t < MIN_START) return 0.0
            if (p.d > 0 && p.t > p.d - 5) return 0.0
            return p.t
        }

        /** The entry to store for position `t` of `duration`, or null to keep what was there. */
        fun next(prev: Progress?, t: Double, duration: Double, now: Long): Progress? {
            if (!(t > 0)) return null
            val d = if (duration > 0) duration else prev?.d ?: 0.0
            val done = isFinished(t, d)
            // Peeking at the first seconds of something shouldn't wipe what was saved before.
            if (!done && t < MIN_START) return null
            return Progress(Math.floor(t), Math.floor(d), done, now)
        }
    }
}

val FONT_SIZES = listOf(14, 16, 18, 20, 22, 24, 28, 32, 36, 40)
val SUBTITLE_BGS = listOf(0, 15, 30, 45, 60, 75, 80, 85, 90, 100)

/** "50 %" */
fun formatBg(pct: Int): String = "$pct %"

val SPEEDS = listOf(0.65f, 0.7f, 0.75f, 0.8f, 0.85f, 0.9f, 0.95f, 1f, 1.05f, 1.1f, 1.2f, 1.3f, 1.4f)
val DISPLAY_MODES = listOf("bilingual" to "Bilingual", "original" to "Original only", "translated" to "Translation only")
val LAYOUTS = listOf("side" to "Side panel (scrolling)", "bottom" to "Bottom captions", "off" to "Hidden")

fun formatRate(r: Float): String {
    val s = if (r == Math.round(r).toFloat()) Math.round(r).toString() else r.toString().trimEnd('0')
    return "$s×"
}

/** Persisted settings, favourites and watch progress (SharedPreferences, exposed as flows). */
object Store {
    private const val MAX_PROGRESS = 500
    private lateinit var prefs: SharedPreferences

    private val _settings = MutableStateFlow(Settings())
    val settings: StateFlow<Settings> = _settings.asStateFlow()
    private val _favorites = MutableStateFlow<List<Favorite>>(emptyList())
    val favorites: StateFlow<List<Favorite>> = _favorites.asStateFlow()
    private val _progress = MutableStateFlow<Map<String, Progress>>(emptyMap())
    val progress: StateFlow<Map<String, Progress>> = _progress.asStateFlow()

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.getSharedPreferences("nss", Context.MODE_PRIVATE)
        _settings.value = loadSettings()
        _favorites.value = loadFavorites()
        _progress.value = loadProgress()
    }

    /* ---------------------------------------------------------- settings */

    private fun loadSettings(): Settings {
        val d = Settings()
        val rate = prefs.getFloat("playbackRate", 1f)
        val size = prefs.getInt("fontSize", d.fontSize)
        val bg = prefs.getInt("subtitleBg", d.subtitleBg)
        val ap = prefs.getInt("autoPause", d.autoPause)
        return Settings(
            targetLang = prefs.getString("targetLang", d.targetLang) ?: d.targetLang,
            displayMode = prefs.getString("displayMode", d.displayMode)?.takeIf { v -> DISPLAY_MODES.any { it.first == v } } ?: d.displayMode,
            layout = prefs.getString("layout", d.layout)?.takeIf { v -> LAYOUTS.any { it.first == v } } ?: d.layout,
            fontSize = if (size in FONT_SIZES) size else d.fontSize,
            playbackRate = if (rate in SPEEDS) rate else 1f,
            subtitleBg = if (bg in SUBTITLE_BGS) bg else d.subtitleBg,
            autoPause = if (ap in AUTO_PAUSE_OPTIONS) ap else d.autoPause,
            deeplKey = prefs.getString("deeplKey", "") ?: "",
        )
    }

    fun updateSettings(change: (Settings) -> Settings) {
        val s = change(_settings.value)
        _settings.value = s
        prefs.edit()
            .putString("targetLang", s.targetLang)
            .putString("displayMode", s.displayMode)
            .putString("layout", s.layout)
            .putInt("fontSize", s.fontSize)
            .putFloat("playbackRate", s.playbackRate)
            .putInt("subtitleBg", s.subtitleBg)
            .putInt("autoPause", s.autoPause)
            .putString("deeplKey", s.deeplKey)
            .apply()
    }

    /* -------------------------------------------------------- favourites */

    private fun loadFavorites(): List<Favorite> = runCatching {
        val a = JSONArray(prefs.getString("favorites", "[]"))
        List(a.length()) { i ->
            val o = a.getJSONObject(i)
            Favorite(
                CardKind.valueOf(o.getString("kind")), o.getString("id"), o.optString("title"),
                o.optString("subtitle"), o.optString("image").ifEmpty { null },
            )
        }
    }.getOrDefault(emptyList())

    private fun saveFavorites(list: List<Favorite>) {
        _favorites.value = list
        val a = JSONArray()
        list.forEach { f ->
            a.put(JSONObject().put("kind", f.kind.name).put("id", f.id).put("title", f.title).put("subtitle", f.subtitle).put("image", f.image ?: ""))
        }
        prefs.edit().putString("favorites", a.toString()).apply()
    }

    fun isFavorite(kind: CardKind, id: String) = _favorites.value.any { it.kind == kind && it.id == id }

    fun addFavorite(f: Favorite) = saveFavorites(listOf(f) + _favorites.value.filterNot { it.kind == f.kind && it.id == f.id })

    fun removeFavorite(kind: CardKind, id: String) = saveFavorites(_favorites.value.filterNot { it.kind == kind && it.id == id })

    /** Refresh a saved entry's title/image without moving it. */
    fun updateFavorite(f: Favorite) {
        if (!isFavorite(f.kind, f.id)) return
        saveFavorites(_favorites.value.map { if (it.kind == f.kind && it.id == f.id) f else it })
    }

    /* ---------------------------------------------------------- progress */

    private fun loadProgress(): Map<String, Progress> = runCatching {
        val o = JSONObject(prefs.getString("progress", "{}") ?: "{}")
        o.keys().asSequence().associateWith { k ->
            val p = o.getJSONObject(k)
            Progress(p.optDouble("t"), p.optDouble("d"), p.optBoolean("done"), p.optLong("at"))
        }
    }.getOrDefault(emptyMap())

    private fun saveProgress(map: Map<String, Progress>) {
        val trimmed = if (map.size > MAX_PROGRESS) map.entries.sortedByDescending { it.value.at }.take(MAX_PROGRESS).associate { it.toPair() } else map
        _progress.value = trimmed
        val o = JSONObject()
        trimmed.forEach { (id, p) -> o.put(id, JSONObject().put("t", p.t).put("d", p.d).put("done", p.done).put("at", p.at)) }
        prefs.edit().putString("progress", o.toString()).apply()
    }

    fun progressOf(id: String): Progress? = _progress.value[id]

    fun recordProgress(id: String, t: Double, duration: Double) {
        val p = Progress.next(_progress.value[id], t, duration, System.currentTimeMillis()) ?: return
        saveProgress(_progress.value + (id to p))
    }

    fun markWatched(id: String, duration: Double = 0.0) {
        val d = if (duration > 0) duration else _progress.value[id]?.d ?: 0.0
        saveProgress(_progress.value + (id to Progress(d, d, true, System.currentTimeMillis())))
    }

    fun clearProgress(id: String) = saveProgress(_progress.value - id)

    fun resumePoint(id: String): Double = Progress.resumePoint(_progress.value[id])
}
