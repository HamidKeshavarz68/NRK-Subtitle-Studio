package app.nrksubtitlestudio.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nrksubtitlestudio.data.Card
import app.nrksubtitlestudio.data.CardKind
import app.nrksubtitlestudio.data.Store
import coil3.compose.AsyncImage
import kotlin.coroutines.cancellation.CancellationException

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

/** Load data for a screen; `initial` (e.g. a cached copy) is shown immediately when available. */
@Composable
fun <T> rememberLoad(vararg keys: Any?, initial: T? = null, load: suspend () -> T): State<Load<T>> =
    produceState<Load<T>>(if (initial != null) Load.Ok(initial) else Load.Loading, *keys) {
        value = try {
            Load.Ok(load())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Load.Err(errorMessage(e))
        }
    }

fun errorMessage(e: Throwable): String = when (e) {
    is java.net.UnknownHostException -> "No internet connection."
    is app.nrksubtitlestudio.data.HttpException -> "NRK answered with an error (${e.code})."
    else -> e.message ?: e.toString()
}

@Composable
fun Spinner(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Colors.Accent)
    }
}

@Composable
fun Hint(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.padding(16.dp), color = Colors.Muted, fontSize = 15.sp)
}

@Composable
fun SmallBadge(text: String, background: Color, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier
            .padding(6.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(background)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        color = Color.White,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
    )
}

/** Blue progress bar along the bottom of a picture, or a "✓ Watched" badge. */
@Composable
fun ProgressOverlay(id: String, modifier: Modifier = Modifier) {
    val all by Store.progress.collectAsState()
    val p = all[id] ?: return
    Box(modifier.fillMaxSize()) {
        if (p.done) {
            SmallBadge("✓ Watched", Color(0xD90B0D14), Modifier.align(Alignment.TopEnd))
        } else if (p.t > 0) {
            ProgressBar(if (p.d > 0) p.fraction.coerceAtLeast(0.03f) else 0.05f, Modifier.align(Alignment.BottomStart).fillMaxWidth().height(5.dp))
        }
    }
}

@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier) {
    Box(modifier.background(Color(0x99000000))) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).background(Colors.Accent))
    }
}

/** Poster card used in rows and grids. */
@Composable
fun PosterCard(card: Card, onClick: () -> Unit, modifier: Modifier = Modifier, portrait: Boolean = false) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(if (portrait) 2f / 3f else 16f / 9f)
                .clip(RoundedCornerShape(10.dp))
                .background(Colors.SurfaceHigh),
        ) {
            AsyncImage(model = card.image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            if (card.kind == CardKind.CHANNEL) SmallBadge("LIVE", Colors.Live, Modifier.align(Alignment.TopStart))
            if (card.kind == CardKind.PROGRAM) ProgressOverlay(card.id)
        }
        if (!portrait) {
            Text(
                card.title,
                Modifier.padding(top = 6.dp, start = 2.dp, end = 2.dp),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = listOf(card.meta, card.subtitle).filter { it.isNotEmpty() }.joinToString(" · ")
            if (sub.isNotEmpty()) {
                Text(sub, Modifier.padding(horizontal = 2.dp), fontSize = 13.sp, color = Colors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** A settings row that opens a list of choices. */
@Composable
fun <T> ChoiceRow(label: String, options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { open = true }
            .padding(horizontal = 12.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 16.sp)
        Text(options.firstOrNull { it.first == value }?.second ?: value.toString(), color = Colors.Accent, fontSize = 16.sp)
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } },
            title = { Text(label) },
            text = {
                LazyColumn {
                    items(options) { (code, name) ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onChange(code)
                                    open = false
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = code == value, onClick = {
                                onChange(code)
                                open = false
                            })
                            Text(name, fontSize = 16.sp)
                        }
                    }
                }
            },
        )
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 8.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}
