package app.nrksubtitlestudio.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

val LANGS = listOf(
    "off" to "— No translation —", "en" to "English", "pl" to "Polski", "de" to "Deutsch", "es" to "Español",
    "fr" to "Français", "it" to "Italiano", "pt" to "Português", "nl" to "Nederlands", "so" to "Soomaali",
    "tr" to "Türkçe", "uk" to "Українська", "hi" to "हिन्दी", "zh" to "中文", "ur" to "اردو", "ar" to "العربية",
    "fa" to "فارسی", "az" to "Azərbaycanca", "da" to "Dansk", "ku" to "Kurdî (Kurmanji)", "lt" to "Lietuvių",
    "ro" to "Română", "fi" to "Suomi", "sv" to "Svenska", "tl" to "Tagalog", "vi" to "Tiếng Việt", "ru" to "Русский",
    "ckb" to "کوردی (Sorani)", "th" to "ไทย", "ti" to "ትግርኛ", "ja" to "日本語", "ko" to "한국어",
)

fun langName(code: String): String = LANGS.firstOrNull { it.first == code }?.second ?: code

private val RTL = setOf("ar", "fa", "ur", "ckb", "he", "iw", "ps", "yi", "sd", "ug", "dv")

/** True for languages written right to left (Persian, Arabic, Urdu, Sorani, Hebrew…). */
fun isRtl(code: String) = code.lowercase().substringBefore('-') in RTL

object DeepL {
    private val MAP = mapOf(
        "en" to "EN-US", "pt" to "PT-PT", "zh" to "ZH", "nb" to "NB", "no" to "NB",
        "ar" to "AR", "bg" to "BG", "cs" to "CS", "da" to "DA", "de" to "DE", "el" to "EL",
        "es" to "ES", "et" to "ET", "fi" to "FI", "fr" to "FR", "hu" to "HU", "id" to "ID",
        "it" to "IT", "ja" to "JA", "ko" to "KO", "lt" to "LT", "lv" to "LV", "nl" to "NL",
        "pl" to "PL", "ro" to "RO", "ru" to "RU", "sk" to "SK", "sl" to "SL", "sv" to "SV",
        "tr" to "TR", "uk" to "UK",
        "fa" to "FA", "ur" to "UR", "hi" to "HI", "az" to "AZ", "tl" to "TL", "vi" to "VI",
        "th" to "TH", "he" to "HE", "iw" to "HE", "ckb" to "CKB", "ku" to "KMR",
    )

    /** DeepL target code, or null when DeepL doesn't offer the language (Somali, Tigrinya). */
    fun target(code: String): String? = MAP[code.lowercase().substringBefore('-')]

    /** Free-tier keys end in ":fx" and use a separate host. */
    fun apiBase(key: String) = "https://" + (if (key.trim().endsWith(":fx")) "api-free.deepl.com" else "api.deepl.com") + "/v2"

    private fun auth(key: String) = mapOf("Authorization" to "DeepL-Auth-Key " + key.trim())

    suspend fun translate(texts: List<String>, target: String, key: String): List<String> {
        val body = StringBuilder("target_lang=").append(URLEncoder.encode(target, "UTF-8"))
        texts.forEach { body.append("&text=").append(URLEncoder.encode(it, "UTF-8")) }
        val raw = Http.postForm(apiBase(key) + "/translate", body.toString(), auth(key))
        val arr = JSONObject(raw).optJSONArray("translations") ?: throw IllegalStateException("bad DeepL response")
        val out = List(arr.length()) { arr.getJSONObject(it).optString("text") }
        if (out.size != texts.size) throw IllegalStateException("DeepL returned ${out.size} of ${texts.size} lines")
        return out
    }

    /** Why DeepL refused, or "" when the error isn't about the key. */
    fun rejection(e: Throwable): String = when ((e as? HttpException)?.code) {
        401, 403 -> "DeepL key rejected"
        456 -> "DeepL quota used up"
        else -> ""
    }

    /** Check a key against /v2/usage and describe the result for the Settings screen. */
    suspend fun check(rawKey: String): String {
        val key = rawKey.trim()
        if (key.isEmpty()) return "No DeepL key: subtitles are translated with Google Translate."
        return try {
            val usage = JSONObject(Http.get(apiBase(key) + "/usage", auth(key)))
            if (Translator.rejectedKey == key) Translator.rejectedKey = null
            val used = usage.optLong("character_count", -1)
            val limit = usage.optLong("character_limit", -1)
            val detail = if (used >= 0 && limit > 0) " (%,d of %,d characters used this period)".format(used, limit) else ""
            "DeepL key works$detail. Subtitles will be translated with DeepL."
        } catch (e: Exception) {
            val r = rejection(e)
            if (r.isNotEmpty()) {
                Translator.rejectedKey = key
                Translator.rejectedReason = r
                "$r. Subtitles will be translated with Google Translate."
            } else {
                "Could not reach DeepL (${e.message}). Subtitles will fall back to Google Translate."
            }
        }
    }
}

object Translator {
    const val SEPARATOR = "\n\n@@@\n\n"
    val SPLIT = Regex("\\s*@@@\\s*")
    /** Last key DeepL refused; skipped until the key changes. */
    var rejectedKey: String? = null
    var rejectedReason = ""
    val cache = HashMap<String, String>()

    fun sourceFor(lang: String) = if (Regex("^(nb|nn|no)", RegexOption.IGNORE_CASE).containsMatchIn(lang)) "no" else "auto"

    suspend fun google(source: String, target: String, text: String): String {
        val url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
            "&sl=" + URLEncoder.encode(source, "UTF-8") +
            "&tl=" + URLEncoder.encode(target, "UTF-8") +
            "&q=" + URLEncoder.encode(text, "UTF-8")
        val data = JSONArray(Http.get(url))
        val segs = data.optJSONArray(0) ?: return ""
        val sb = StringBuilder()
        for (i in 0 until segs.length()) sb.append(segs.optJSONArray(i)?.optString(0) ?: "")
        return sb.toString()
    }
}

/**
 * Translates a whole subtitle file in the background, starting at the current
 * position. DeepL when a key is set (and DeepL supports the language), Google
 * Translate otherwise or whenever DeepL fails. Runs on the caller's (main) scope.
 */
class CueTranslator(
    private val cues: List<Cue>,
    sourceLang: String,
    private val target: String,
    private val scope: CoroutineScope,
    private val deeplKey: () -> String,
) {
    private companion object {
        const val MAX_CHARS = 1200
        const val MAX_ITEMS = 60
    }

    val out = arrayOfNulls<String>(cues.size)
    /** Bumped whenever translations arrive or the state changes (observable from Compose). */
    var version by mutableIntStateOf(0)
        private set
    var failed = false
        private set
    var provider: String? = null
        private set
    /** Why DeepL isn't used although a key is set ("" when it is, or there's no key). */
    var deeplIssue = ""
        private set
    val done: Int get() = out.count { it != null }

    private val source = Translator.sourceFor(sourceLang)
    private var cursor = 0
    private var job: Job? = null

    init {
        for (i in cues.indices) Translator.cache[key(i)]?.let { out[i] = it }
    }

    private fun key(i: Int) = source + "|" + target + "|" + cues[i].text.replace(Regex("\\s+"), " ").trim()

    /** Translate from cue `index` onwards next (call on start and after seeks). */
    fun focusOn(index: Int) {
        cursor = maxOf(0, index - 2)
        if (job?.isActive != true) job = scope.launch { loop() }
    }

    fun stop() {
        job?.cancel()
    }

    private fun nextPending(): Int {
        val n = cues.size
        for (k in 0 until n) {
            val i = (cursor + k) % n
            if (out[i] == null) return i
        }
        return -1
    }

    private suspend fun loop() {
        var errors = 0
        while (true) {
            val start = nextPending()
            if (start < 0) break
            val indices = ArrayList<Int>()
            var chars = 0
            var i = start
            while (i < cues.size && indices.size < MAX_ITEMS) {
                if (out[i] != null) {
                    if (indices.isNotEmpty()) break
                    i++
                    continue
                }
                val len = cues[i].text.length + Translator.SEPARATOR.length
                if (indices.isNotEmpty() && chars + len > MAX_CHARS) break
                indices.add(i)
                chars += len
                i++
            }
            try {
                translateBatch(indices)
                errors = 0
                failed = false
                cursor = indices.last() + 1
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                errors++
                if (errors >= 3) {
                    failed = true
                    version++
                    delay(15_000)
                } else {
                    delay(1500L * errors)
                }
                continue
            }
            version++
            delay(50)
        }
    }

    private fun usableKey(): String {
        val key = deeplKey().trim()
        if (key.isEmpty()) {
            deeplIssue = ""
            return ""
        }
        if (DeepL.target(target) == null) {
            deeplIssue = "language not supported by DeepL"
            return ""
        }
        if (Translator.rejectedKey == key) {
            deeplIssue = Translator.rejectedReason
            return ""
        }
        return key
    }

    private suspend fun translateBatch(indices: List<Int>) {
        val texts = indices.map { cues[it].text }
        val key = usableKey()
        if (key.isNotEmpty()) {
            try {
                val parts = DeepL.translate(texts, DeepL.target(target)!!, key)
                indices.forEachIndexed { k, idx -> store(idx, parts[k].trim()) }
                provider = "DeepL"
                deeplIssue = ""
                return
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val r = DeepL.rejection(e)
                if (r.isNotEmpty()) {
                    Translator.rejectedKey = key
                    Translator.rejectedReason = r
                }
                deeplIssue = r.ifEmpty { "DeepL unavailable" }
            }
        }
        provider = "Google"
        val result = Translator.google(source, target, texts.joinToString(Translator.SEPARATOR))
        val parts = result.split(Translator.SPLIT)
        if (parts.size == indices.size) {
            indices.forEachIndexed { k, idx -> store(idx, parts[k].trim()) }
            return
        }
        // Separator got mangled: fall back to one request per cue.
        for (idx in indices) {
            store(idx, Translator.google(source, target, cues[idx].text).trim())
            delay(50)
        }
    }

    private fun store(i: Int, text: String) {
        out[i] = text
        Translator.cache[key(i)] = text
    }
}
