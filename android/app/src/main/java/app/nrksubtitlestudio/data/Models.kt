package app.nrksubtitlestudio.data

enum class CardKind { SERIES, PROGRAM, CHANNEL }

data class Card(
    val kind: CardKind,
    val id: String,
    val title: String,
    val subtitle: String = "",
    val image: String? = null,
    val meta: String = "",
    /** Front page extras: wide backdrop, title logo and promo tagline. */
    val backdrop: String? = null,
    val logo: String? = null,
    val tagline: String = "",
)

enum class SectionKind { HERO, LANDSCAPE, PORTRAIT, BANNER }

data class Section(val kind: SectionKind, val title: String, val cards: List<Card>)

data class Season(val title: String, val href: String)

data class SeriesInfo(
    val id: String,
    val title: String,
    val description: String,
    val image: String?,
    val backdrop: String?,
    val seasons: List<Season>,
)

data class ProgramInfo(
    val id: String,
    val title: String,
    val subtitle: String,
    val description: String,
    val image: String?,
    val seriesId: String?,
    val meta: String,
    val playable: Boolean,
    val message: String,
)

data class SubtitleTrack(val language: String, val label: String, val type: String, val url: String, val defaultOn: Boolean)

data class Stream(val url: String, val format: String)

data class Playback(
    val id: String,
    val kind: String,
    val title: String,
    val subtitle: String,
    val streams: List<Stream>,
    val isLive: Boolean,
    val subtitles: List<SubtitleTrack>,
)

data class Cue(val start: Double, val end: Double, val text: String)

/** A playback error with a user-facing message from NRK when available. */
class NotPlayableException(message: String) : Exception(message)

/** Cards opened from lists, so detail screens can show them before their own data loads. */
object CardCache {
    private val cards = HashMap<String, Card>()
    fun put(card: Card) {
        cards[card.kind.name + ":" + card.id] = card
    }
    fun get(kind: CardKind, id: String): Card? = cards[kind.name + ":" + id]
}
