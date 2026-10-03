package app.nrksubtitlestudio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import app.nrksubtitlestudio.data.Card
import app.nrksubtitlestudio.data.Nrk
import app.nrksubtitlestudio.data.Section
import app.nrksubtitlestudio.data.SectionKind
import app.nrksubtitlestudio.data.Store
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay

enum class Tab(val icon: String, val label: String) {
    HOME("⌂", "Front page"),
    FAVORITES("★", "Favourites"),
    LIVE("●", "Live TV"),
    SEARCH("⌕", "Search"),
    GUIDE("?", "Guide"),
    SETTINGS("⚙", "Settings"),
}

@Composable
fun HomeScreen(nav: NavHostController) {
    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600
    // Phones get a 5-item bottom bar; the Guide opens from Settings there.
    val phoneTabs = Tab.entries.filter { it != Tab.GUIDE }
    Scaffold(
        containerColor = Colors.Background,
        bottomBar = {
            if (!wide) {
                NavigationBar(containerColor = Colors.Surface) {
                    phoneTabs.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t || (t == Tab.SETTINGS && tab == Tab.GUIDE),
                            onClick = { tab = t },
                            icon = { Text(t.icon, fontSize = 20.sp) },
                            label = { Text(t.label, fontSize = 11.sp, maxLines = 1) },
                        )
                    }
                }
            }
        },
    ) { pad ->
        Row(Modifier.fillMaxSize().padding(pad)) {
            if (wide) {
                NavigationRail(containerColor = Colors.Surface) {
                    Text("NRK", Modifier.padding(vertical = 12.dp), color = Colors.Live, fontWeight = FontWeight.Black, fontSize = 18.sp)
                    Tab.entries.forEach { t ->
                        NavigationRailItem(
                            selected = tab == t,
                            onClick = { tab = t },
                            icon = { Text(t.icon, fontSize = 20.sp) },
                            label = { Text(t.label, fontSize = 11.sp) },
                        )
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxSize()) {
                when (tab) {
                    Tab.HOME -> FrontPage(nav)
                    Tab.FAVORITES -> FavoritesTab(nav)
                    Tab.LIVE -> LiveTab(nav)
                    Tab.SEARCH -> SearchTab(nav)
                    Tab.GUIDE -> GuideScreen(onBack = if (wide) null else ({ tab = Tab.SETTINGS }))
                    Tab.SETTINGS -> SettingsScreen(onOpenGuide = if (wide) null else ({ tab = Tab.GUIDE }))
                }
            }
        }
    }
}

@Composable
fun ErrorRetry(message: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(24.dp)) {
        Text(message, color = Color(0xFFFF8A8A))
        Text("Many NRK programmes can only be watched from Norway.", color = Colors.Muted, fontSize = 14.sp)
    }
}

/* ------------------------------------------------------------ front page */

@Composable
fun FrontPage(nav: NavHostController) {
    val state by rememberLoad(Unit, initial = Nrk.peek<List<Section>>("frontpage")) { Nrk.frontpage() }
    when (val s = state) {
        is Load.Loading -> Spinner()
        is Load.Err -> ErrorRetry(s.message)
        is Load.Ok -> LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            itemsIndexed(s.value) { _, sec ->
                when (sec.kind) {
                    SectionKind.HERO -> Hero(sec.cards, nav)
                    SectionKind.BANNER -> Banner(sec.cards[0], nav)
                    else -> CardRow(sec, nav)
                }
            }
        }
    }
}

@Composable
private fun Hero(cards: List<Card>, nav: NavHostController) {
    val pager = rememberPagerState { cards.size }
    LaunchedEffect(pager, cards.size) {
        while (cards.size > 1) {
            delay(7000)
            if (!pager.isScrollInProgress) pager.animateScrollToPage((pager.currentPage + 1) % cards.size)
        }
    }
    Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).heightIn(max = 460.dp)) {
        HorizontalPager(pager, Modifier.fillMaxSize()) { page ->
            val card = cards[page]
            Box(Modifier.fillMaxSize().clickable { nav.openCard(card) }) {
                AsyncImage(card.backdrop ?: card.image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(0.35f to Color.Transparent, 1f to Colors.Background),
                    ),
                )
                Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
                    if (card.logo != null) {
                        AsyncImage(card.logo, card.title, Modifier.height(56.dp).widthIn(max = 260.dp), contentScale = ContentScale.Fit, alignment = Alignment.CenterStart)
                    } else {
                        Text(card.title, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    }
                    val line = card.tagline.ifEmpty { card.subtitle }
                    if (line.isNotEmpty()) {
                        Text(line, Modifier.padding(top = 6.dp), fontSize = 14.sp, color = Color(0xFFD5D8E3), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = { nav.openCard(card, play = true) }) { Text("▶  Watch") }
                        OutlinedButton(onClick = { nav.openCard(card) }) { Text("Info") }
                    }
                }
            }
        }
        Row(Modifier.align(Alignment.BottomEnd).padding(16.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            repeat(cards.size) { i ->
                Box(
                    Modifier.size(if (i == pager.currentPage) 9.dp else 6.dp).clip(CircleShape)
                        .background(if (i == pager.currentPage) Color.White else Color(0x80FFFFFF)),
                )
            }
        }
    }
}

@Composable
private fun CardRow(sec: Section, nav: NavHostController) {
    val portrait = sec.kind == SectionKind.PORTRAIT
    if (sec.title.isNotEmpty()) SectionHeader(sec.title)
    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(sec.cards) { c ->
            PosterCard(c, { nav.openCard(c) }, Modifier.width(if (portrait) 120.dp else 240.dp), portrait = portrait)
        }
    }
}

@Composable
private fun Banner(card: Card, nav: NavHostController) {
    Box(
        Modifier.padding(16.dp).fillMaxWidth().aspectRatio(21f / 9f).clip(RoundedCornerShape(12.dp))
            .clickable { nav.openCard(card) },
    ) {
        AsyncImage(card.backdrop ?: card.image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Color(0xCC000000), 0.7f to Color.Transparent)))
        Column(Modifier.align(Alignment.CenterStart).padding(16.dp).widthIn(max = 280.dp)) {
            Text(card.title, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 2)
            val line = card.tagline.ifEmpty { card.subtitle }
            if (line.isNotEmpty()) Text(line, fontSize = 13.sp, color = Color(0xFFD5D8E3), maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

/* ------------------------------------------------------- grids and tabs */

@Composable
fun CardGrid(cards: List<Card>, nav: NavHostController, header: (@Composable () -> Unit)? = null) {
    LazyVerticalGrid(
        GridCells.Adaptive(160.dp),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (header != null) item(span = { GridItemSpan(maxLineSpan) }) { header() }
        items(cards) { c -> PosterCard(c, { nav.openCard(c) }) }
    }
}

@Composable
fun FavoritesTab(nav: NavHostController) {
    val favs by Store.favorites.collectAsState()
    Column(Modifier.fillMaxSize()) {
        SectionHeader("Favourites")
        if (favs.isEmpty()) {
            Hint("No favourites yet. Open a series or a film and tap ☆ Add to favourites. Favouriting an episode saves its series.")
            return@Column
        }
        LazyVerticalGrid(
            GridCells.Adaptive(160.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items(favs, key = { it.kind.name + it.id }) { f ->
                Box {
                    PosterCard(f.toCard(), { nav.openCard(f.toCard()) })
                    Text(
                        "✕",
                        Modifier.align(Alignment.TopEnd).padding(6.dp).size(30.dp).clip(CircleShape)
                            .background(Color(0xCC0B0D14))
                            .clickable { Store.removeFavorite(f.kind, f.id) }
                            .padding(top = 4.dp),
                        color = Color.White,
                        fontSize = 15.sp,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
fun LiveTab(nav: NavHostController) {
    val state by rememberLoad(Unit, initial = Nrk.peek<List<Card>>("channels")) { Nrk.channels() }
    when (val s = state) {
        is Load.Loading -> Spinner()
        is Load.Err -> ErrorRetry(s.message)
        is Load.Ok -> CardGrid(s.value, nav) { Text("Live TV", fontSize = 18.sp, fontWeight = FontWeight.Bold) }
    }
}

@Composable
fun SearchTab(nav: NavHostController) {
    var query by rememberSaveable { mutableStateOf("") }
    var submitted by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val results by rememberLoad(submitted) { if (submitted.isBlank()) emptyList() else Nrk.search(submitted) }
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            singleLine = true,
            placeholder = { Text("Search NRK TV") },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                submitted = query.trim()
                focus.clearFocus()
            }),
        )
        when (val r = results) {
            is Load.Loading -> Spinner()
            is Load.Err -> ErrorRetry(r.message)
            is Load.Ok -> when {
                submitted.isBlank() -> Hint("Type a title and press search on the keyboard.")
                r.value.isEmpty() -> Hint("Nothing found for “$submitted”.")
                else -> CardGrid(r.value, nav)
            }
        }
        Spacer(Modifier.height(0.dp))
    }
}
