package app.nrksubtitlestudio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.widget.Toast
import androidx.navigation.NavHostController
import app.nrksubtitlestudio.data.Card
import app.nrksubtitlestudio.data.CardCache
import app.nrksubtitlestudio.data.CardKind
import app.nrksubtitlestudio.data.Favorite
import app.nrksubtitlestudio.data.Nrk
import app.nrksubtitlestudio.data.ProgramInfo
import app.nrksubtitlestudio.data.Progress
import app.nrksubtitlestudio.data.SeriesInfo
import app.nrksubtitlestudio.data.Store
import coil3.compose.AsyncImage

@Composable
private fun Backdrop(image: String?, onBack: () -> Unit) {
    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).heightIn(max = 380.dp)) {
        AsyncImage(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.4f to Color.Transparent, 1f to Colors.Background)))
        Text(
            "←",
            Modifier.statusBarsPadding().padding(8.dp).size(40.dp).clip(CircleShape)
                .background(Color(0x990B0D14)).clickable(onClick = onBack).padding(top = 4.dp),
            fontSize = 22.sp,
            color = Color.White,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/* --------------------------------------------------------------- series */

@Composable
fun SeriesScreen(nav: NavHostController, id: String) {
    val fallback = CardCache.get(CardKind.SERIES, id)
    val info by rememberLoad(id, initial = Nrk.peek<SeriesInfo>("series:$id")) { Nrk.series(id) }
    val favs by Store.favorites.collectAsState()
    val isFav = favs.any { it.kind == CardKind.SERIES && it.id == id }
    var seasonIdx by rememberSaveable(id) { mutableIntStateOf(-1) }
    val series = (info as? Load.Ok)?.value

    LaunchedEffect(series) {
        if (series != null) {
            Store.updateFavorite(Favorite(CardKind.SERIES, id, series.title, series.description, series.image))
            if (seasonIdx < 0 && series.seasons.isNotEmpty()) {
                // Year-named seasons: open the newest. Otherwise the first (season 1 / latest).
                val years = series.seasons.map { it.title.toIntOrNull() }
                seasonIdx = if (years.all { it != null && it in 1900..2999 }) years.indices.maxBy { years[it]!! } else 0
            }
        }
    }
    val season = series?.seasons?.getOrNull(seasonIdx)
    val episodes by rememberLoad(season?.href) { season?.let { Nrk.episodes(it.href) } ?: emptyList() }

    LazyVerticalGrid(
        GridCells.Adaptive(170.dp),
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column {
                Backdrop(series?.backdrop ?: series?.image ?: fallback?.image) { nav.popBackStack() }
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text(series?.title ?: fallback?.title ?: "", fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    val desc = series?.description ?: fallback?.subtitle ?: ""
                    if (desc.isNotEmpty()) Text(desc, Modifier.padding(top = 6.dp), fontSize = 15.sp, color = Color(0xFFD5D8E3))
                    OutlinedButton(
                        onClick = {
                            if (isFav) Store.removeFavorite(CardKind.SERIES, id)
                            else Store.addFavorite(Favorite(CardKind.SERIES, id, series?.title ?: fallback?.title ?: id, series?.description ?: "", series?.image ?: fallback?.image))
                        },
                        Modifier.padding(top = 12.dp),
                    ) { Text(if (isFav) "★  In favourites" else "☆  Add to favourites") }
                    when (val s = info) {
                        is Load.Err -> ErrorRetry(s.message)
                        is Load.Loading -> Spinner()
                        else -> {}
                    }
                }
                if (series != null && series.seasons.size > 1) {
                    LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        itemsIndexed(series.seasons) { i, s ->
                            FilterChip(selected = i == seasonIdx, onClick = { seasonIdx = i }, label = { Text(s.title.ifEmpty { "Season" }) })
                        }
                    }
                }
                if (series != null && series.seasons.isEmpty()) Hint("Nothing to watch here yet.")
            }
        }
        when (val e = episodes) {
            is Load.Loading -> if (season != null) item(span = { GridItemSpan(maxLineSpan) }) { Spinner() }
            is Load.Err -> item(span = { GridItemSpan(maxLineSpan) }) { ErrorRetry(e.message) }
            is Load.Ok -> {
                if (season != null && e.value.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) { Hint("No episodes are available to watch in this season yet.") }
                }
                items(e.value) { c ->
                    PosterCard(c, { nav.openCard(c, play = true) }, Modifier.padding(horizontal = 4.dp))
                }
            }
        }
    }
}

/* -------------------------------------------------------------- details */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailsScreen(nav: NavHostController, id: String) {
    val card = CardCache.get(CardKind.PROGRAM, id)
    val context = LocalContext.current
    val info by rememberLoad(id) { Nrk.programInfo(id) }
    val pi: ProgramInfo? = (info as? Load.Ok)?.value
    val seriesInfo by rememberLoad(pi?.seriesId) { pi?.seriesId?.let { runCatching { Nrk.series(it) }.getOrNull() } }
    val series = (seriesInfo as? Load.Ok)?.value
    val favs by Store.favorites.collectAsState()
    val all by Store.progress.collectAsState()
    val p = all[id]
    val name = pi?.title?.ifEmpty { null } ?: card?.title ?: ""

    // Favouriting an episode saves its series.
    val target: Favorite? = when {
        pi == null -> null
        pi.seriesId != null -> Favorite(CardKind.SERIES, pi.seriesId, series?.title ?: name, series?.description ?: "", series?.image ?: card?.image ?: pi.image)
        else -> Favorite(CardKind.PROGRAM, id, name, pi.description, card?.image ?: pi.image)
    }
    val isFav = target != null && favs.any { it.kind == target.kind && it.id == target.id }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Backdrop(card?.backdrop ?: card?.image ?: pi?.image) { nav.popBackStack() }
        Column(Modifier.padding(horizontal = 16.dp)) {
            if (series != null && series.title != name) Text(series.title.uppercase(), color = Colors.Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(name, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            val meta = pi?.meta?.ifEmpty { null } ?: card?.meta ?: ""
            if (meta.isNotEmpty()) Text(meta, Modifier.padding(top = 4.dp), color = Color(0xFFAEB4C7), fontSize = 14.sp)
            val label = Progress.label(p)
            if (label.isNotEmpty()) {
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(label, fontSize = 14.sp)
                    if (p != null && !p.done && p.d > 0) {
                        ProgressBar(p.fraction, Modifier.padding(start = 12.dp).width(140.dp).height(5.dp).clip(RoundedCornerShape(3.dp)))
                    }
                }
            }
            val description = pi?.description?.ifEmpty { null } ?: card?.subtitle ?: ""
            val sub = pi?.subtitle ?: ""
            if (sub.isNotEmpty() && sub != description && sub != name) Text(sub, Modifier.padding(top = 10.dp), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            if (description.isNotEmpty()) Text(description, Modifier.padding(top = 6.dp), fontSize = 15.sp, color = Color(0xFFD5D8E3))

            FlowRow(Modifier.padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { nav.openPlayer("program", id, name) }) {
                    Text(if (p == null) "▶  Watch" else if (p.done) "↺  Watch again" else "▶  Continue")
                }
                OutlinedButton(onClick = {
                    if (p != null && p.done) {
                        Store.clearProgress(id)
                        Toast.makeText(context, "Marked as not watched", Toast.LENGTH_SHORT).show()
                    } else {
                        Store.markWatched(id)
                        Toast.makeText(context, "Marked as watched", Toast.LENGTH_SHORT).show()
                    }
                }) { Text(if (p != null && p.done) "○  Mark as not watched" else "✓  Mark as watched") }
                if (target != null) {
                    OutlinedButton(onClick = {
                        if (isFav) Store.removeFavorite(target.kind, target.id) else Store.addFavorite(target)
                    }) {
                        val what = if (target.kind == CardKind.SERIES) "series " else ""
                        Text(if (isFav) "★  ${if (what.isNotEmpty()) "Series in" else "In"} favourites" else "☆  Add ${what}to favourites")
                    }
                }
                if (pi?.seriesId != null) {
                    OutlinedButton(onClick = {
                        CardCache.put(Card(CardKind.SERIES, pi.seriesId, series?.title ?: name, image = series?.image))
                        nav.navigate("series/${android.net.Uri.encode(pi.seriesId)}")
                    }) { Text("☰  All episodes") }
                }
            }
            when (val i = info) {
                is Load.Err -> ErrorRetry(i.message)
                is Load.Loading -> Spinner()
                is Load.Ok -> if (!i.value.playable && i.value.message.isNotEmpty()) Text(i.value.message, color = Color(0xFFFFB4A0))
            }
        }
    }
}
