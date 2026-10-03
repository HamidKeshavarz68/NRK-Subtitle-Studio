package app.nrksubtitlestudio.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.json.JSONObject
import java.net.URLDecoder
import java.net.URLEncoder

/**
 * Thin, defensive client for NRK's public psapi endpoints (port of the TV app's
 * nrk.ts). Only the fields the app needs are extracted.
 */
object Nrk {
    private const val PSAPI = "https://psapi.nrk.no"
    private val PROGRAM_ID = Regex("^[A-Za-z]{2,6}\\d{6,}$")
    private const val CACHE_MS = 5 * 60 * 1000L

    private class Cached(val at: Long, val value: Any)
    private val cache = HashMap<String, Cached>()

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T : Any> cached(key: String, load: suspend () -> T): T {
        val hit = cache[key]
        if (hit != null && System.currentTimeMillis() - hit.at < CACHE_MS) return hit.value as T
        val v = load()
        cache[key] = Cached(System.currentTimeMillis(), v)
        return v
    }

    /** Synchronously available cached value (lets lists restore their scroll position). */
    @Suppress("UNCHECKED_CAST")
    fun <T> peek(key: String): T? = cache[key]?.takeIf { System.currentTimeMillis() - it.at < CACHE_MS }?.value as T?

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    /** Pick the image closest to (but not below) `want` px wide from any NRK image list shape. */
    fun pickImage(list: Any?, want: Int = 600): String? {
        var bestUrl: String? = null
        var bestW = 0
        for (item in list.list()) {
            if (item !is JSONObject) continue
            val url = item.str("uri").ifEmpty { item.str("url") }.ifEmpty { item.str("imageUrl") }
            if (url.isEmpty()) continue
            val w = (item.num("width") ?: item.num("pixelWidth") ?: 0.0).toInt()
            if (bestUrl == null || (bestW < want && w > bestW) || (w >= want && w < bestW)) {
                bestUrl = url
                bestW = w
            }
        }
        return bestUrl
    }

    /** ISO 8601 duration ("PT1H19M29S") → "1 t 19 min" / "31 min". */
    fun formatDuration(iso: String): String {
        val m = Regex("^PT(?:(\\d+)H)?(?:(\\d+)M)?(?:([\\d.]+)S)?$").find(iso) ?: return ""
        val hours = m.groupValues[1].toIntOrNull() ?: 0
        val mins = (m.groupValues[2].toIntOrNull() ?: 0) + if ((m.groupValues[3].toDoubleOrNull() ?: 0.0) >= 30) 1 else 0
        if (hours == 0 && mins == 0) return ""
        return if (hours > 0) "$hours t" + (if (mins > 0) " $mins min" else "") else "$mins min"
    }

    private fun plugToCard(plug: Any?): Card? {
        val dcc = plug.at("displayContractContent")
        val title = dcc.str("contentTitle")
        val image = pickImage(dcc.at("displayContractImage.webImages"))
            ?: pickImage(dcc.at("backdropImage.webImages"))
            ?: pickImage(dcc.at("fallbackImage.webImages"))
        val subtitle = dcc.str("description")
        val type = plug.str("targetType")
        val base: Card = when (type) {
            "series" -> plug.str("series.seriesId").takeIf { it.isNotEmpty() }?.let {
                Card(CardKind.SERIES, it, title, subtitle, image)
            }
            "episode", "standaloneProgram", "program" -> {
                val prog = plug.at(type)
                prog.str("programId").takeIf { it.isNotEmpty() }?.let {
                    Card(CardKind.PROGRAM, it, title, subtitle, image, formatDuration(prog.str("duration")))
                }
            }
            "channel" -> plug.str("channel.channelId").takeIf { it.isNotEmpty() }?.let {
                Card(CardKind.CHANNEL, it, title, subtitle, image)
            }
            else -> null
        } ?: return null
        return base.copy(
            backdrop = pickImage(dcc.at("backdropImage.webImages"), 1600) ?: pickImage(dcc.at("cinematicImage.webImages"), 1600),
            logo = pickImage(dcc.at("logoImage"), 600),
            tagline = dcc.str("tagline").trim(),
        )
    }

    /** Row titles meant for logged-in users ("Logg deg på for …") lose that clause. */
    private fun sectionTitle(raw: String, plugs: List<Any?>): String {
        val cleaned = raw.replace(Regex("\\s*\\blogg (deg )?på(?![a-zæøå])[^.?!]*[.?!]?", RegexOption.IGNORE_CASE), "").trim()
        if (cleaned.isNotEmpty()) return cleaned
        for (p in plugs) {
            if (p.str("targetType") != "page") continue
            val s = p.str("displayContractContent.contentTitle").trim()
                .replace(Regex("^se (mer|flere)\\s+", RegexOption.IGNORE_CASE), "")
            if (s.isNotEmpty()) return s.replaceFirstChar { it.uppercase() }
        }
        return ""
    }

    suspend fun frontpage(): List<Section> = cached("frontpage") {
        val page = Http.json("$PSAPI/tv/pages/frontpage")
        val sections = ArrayList<Section>()
        for (section in page.list("sections")) {
            val included = section.at("included") as? JSONObject ?: continue
            val plugs = included.list("plugs")
            val cards = plugs.mapNotNull { plugToCard(it) }
            if (cards.isEmpty()) continue
            val contract = included.str("displayContract")
            val hasHero = sections.any { it.kind == SectionKind.HERO }
            var kind = when {
                contract == "multiHero" && !hasHero -> SectionKind.HERO
                contract == "inlineHero" -> SectionKind.BANNER
                contract.startsWith("portrait", ignoreCase = true) -> SectionKind.PORTRAIT
                else -> SectionKind.LANDSCAPE
            }
            if (kind == SectionKind.BANNER && cards[0].backdrop == null && cards[0].image == null) kind = SectionKind.LANDSCAPE
            val title = sectionTitle(included.str("title"), plugs).ifEmpty { if (kind == SectionKind.BANNER) "" else "Utvalgt" }
            if (kind == SectionKind.BANNER) cards.forEach { sections.add(Section(kind, title, listOf(it))) }
            else sections.add(Section(kind, title, cards))
        }
        sections
    }

    suspend fun channels(): List<Card> = cached("channels") {
        Http.json("$PSAPI/tv/live").list().mapNotNull { ch ->
            val id = ch.str("id")
            if (id.isEmpty()) return@mapNotNull null
            val pb = ch.at("_embedded.playback")
            val image = pickImage(pb.list("posters").firstOrNull().at("image.items"))
            Card(CardKind.CHANNEL, id, pb.str("title").ifEmpty { id.uppercase() }, image = image)
        }
    }

    suspend fun search(query: String): List<Card> {
        val data = Http.json("$PSAPI/search?q=${enc(query)}&pageSize=40")
        val out = ArrayList<Card>()
        val seen = HashSet<String>()
        for (h in data.list("hits")) {
            val type = h.str("type")
            val hit = h.at("hit") as? JSONObject ?: continue
            val lastSeg = hit.str("url").split('/').lastOrNull { it.isNotEmpty() } ?: ""
            val image = pickImage(hit.at("image.webImages"))
            val title = hit.str("title")
            val sub = hit.str("description")
            val card = when (type) {
                "serie", "series" -> hit.str("seriesId").ifEmpty { lastSeg }.takeIf { it.isNotEmpty() }
                    ?.let { Card(CardKind.SERIES, it, title, sub, image) }
                "program", "episode" -> {
                    val id = hit.str("id").takeIf { PROGRAM_ID.matches(it) } ?: lastSeg
                    if (PROGRAM_ID.matches(id)) Card(CardKind.PROGRAM, id, title, sub, image) else null
                }
                else -> null
            }
            if (card != null && seen.add(card.kind.name + card.id)) out.add(card)
        }
        return out
    }

    suspend fun series(id: String): SeriesInfo = cached("series:$id") {
        val s = Http.json("$PSAPI/tv/catalog/series/${enc(id)}")
        val type = s.str("seriesType")
        val body = (if (type.isNotEmpty()) s.at(type) else null) ?: s.at("sequential") ?: s.at("standard") ?: s.at("news")
        val seasons = s.list("_links.seasons").mapNotNull { l ->
            val href = l.str("href")
            if (href.isEmpty()) null else Season(l.str("title").ifEmpty { l.str("name") }, href)
        }
        SeriesInfo(
            id = id,
            title = body.str("titles.title").ifEmpty { id },
            description = body.str("titles.subtitle"),
            image = pickImage(body.at("image")),
            backdrop = pickImage(body.at("backdropImage"), 1280) ?: pickImage(body.at("image"), 1280),
            seasons = seasons,
        )
    }

    suspend fun episodes(href: String): List<Card> = cached("season:$href") {
        val season = Http.json(PSAPI + href)
        (season.list("_embedded.episodes") + season.list("_embedded.instalments")).mapNotNull { ep ->
            val id = ep.str("prfId")
            if (id.isEmpty() || ep.str("availability.status") != "available") return@mapNotNull null
            Card(
                CardKind.PROGRAM, id,
                title = ep.str("titles.title"),
                subtitle = ep.str("titles.subtitle"),
                image = pickImage(ep.at("image")),
                meta = ep.str("durationDisplayValue"),
            )
        }
    }

    suspend fun programInfo(id: String): ProgramInfo {
        val m = Http.json("$PSAPI/playback/metadata/program/${enc(id)}")
        val seriesHref = m.str("_links.series.href")
        val seriesId = seriesHref.split('/').lastOrNull { it.isNotEmpty() }?.let { URLDecoder.decode(it, "UTF-8") }
        val meta = listOf(formatDuration(m.str("duration")), m.str("legalAge.body.rating.displayAge"))
            .filter { it.isNotEmpty() }.joinToString(" · ")
        return ProgramInfo(
            id = id,
            title = m.str("preplay.titles.title"),
            subtitle = m.str("preplay.titles.subtitle"),
            description = m.str("preplay.description"),
            image = pickImage(m.at("preplay.poster.images"), 1280),
            seriesId = seriesId?.takeIf { it.isNotEmpty() && seriesHref.isNotEmpty() },
            meta = meta,
            playable = m.str("playability") == "playable",
            message = m.str("nonPlayable.endUserMessage"),
        )
    }

    suspend fun playback(kind: String, id: String): Playback = coroutineScope {
        val base = "$PSAPI/playback"
        val manifestJob = async { Http.json("$base/manifest/$kind/${enc(id)}") }
        val metadataJob = async { runCatching { Http.json("$base/metadata/$kind/${enc(id)}") }.getOrNull() }
        val manifest = manifestJob.await()
        val metadata = metadataJob.await()
        if (manifest.str("playability") != "playable") {
            throw NotPlayableException(
                manifest.str("nonPlayable.endUserMessage")
                    .ifEmpty { metadata.str("nonPlayable.endUserMessage") }
                    .ifEmpty { "This programme can't be played right now." }
            )
        }
        val streams = pickStreams(manifest.list("playable.assets"))
        if (streams.isEmpty()) throw NotPlayableException("No supported stream was found for this programme.")
        val subtitles = manifest.list("playable.subtitles").mapNotNull { s ->
            val url = s.str("webVtt")
            if (url.isEmpty()) null
            else SubtitleTrack(s.str("language"), s.str("label"), s.str("type"), url, s.at("defaultOn") == true)
        }
        Playback(
            id = id,
            kind = kind,
            title = metadata.str("preplay.titles.title").ifEmpty { id },
            subtitle = metadata.str("preplay.titles.subtitle"),
            streams = streams,
            isLive = manifest.str("streamingMode") == "live",
            subtitles = subtitles,
        )
    }

    /** Unencrypted or AES-128 ("statickey") HLS/DASH assets; DRM streams are skipped. */
    fun pickStreams(assets: List<Any?>): List<Stream> {
        val out = LinkedHashMap<String, Stream>()
        for (a in assets) {
            val url = a.str("url")
            val scheme = a.str("encryptionScheme").ifEmpty { "none" }.lowercase()
            if (url.isEmpty() || (scheme != "none" && scheme != "statickey")) continue
            val fmt = a.str("format").lowercase()
            val mime = a.str("mimeType").lowercase()
            val format = when {
                fmt == "hls" || "mpegurl" in mime || Regex("\\.m3u8(\\?|$)").containsMatchIn(url) -> "hls"
                fmt == "dash" || "dash" in mime || Regex("\\.mpd(\\?|$)").containsMatchIn(url) -> "dash"
                else -> continue
            }
            out.putIfAbsent(url, Stream(url, format))
        }
        return out.values.toList()
    }

    /** Prefer the default-on track, then the Norwegian one, then the first. */
    fun pickSubtitleTrack(tracks: List<SubtitleTrack>): SubtitleTrack? =
        tracks.firstOrNull { it.defaultOn } ?: tracks.firstOrNull { it.type == "nor" } ?: tracks.firstOrNull()

    suspend fun cues(track: SubtitleTrack): List<Cue> = Vtt.parse(Http.get(track.url))
}
