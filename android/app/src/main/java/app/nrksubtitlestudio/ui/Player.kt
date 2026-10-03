package app.nrksubtitlestudio.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.view.View
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import app.nrksubtitlestudio.data.Cue
import app.nrksubtitlestudio.data.CueTranslator
import app.nrksubtitlestudio.data.DISPLAY_MODES
import app.nrksubtitlestudio.data.FONT_SIZES
import app.nrksubtitlestudio.data.LAYOUTS
import app.nrksubtitlestudio.data.NotPlayableException
import app.nrksubtitlestudio.data.Nrk
import app.nrksubtitlestudio.data.Playback
import app.nrksubtitlestudio.data.SPEEDS
import app.nrksubtitlestudio.data.SUBTITLE_BGS
import app.nrksubtitlestudio.data.formatBg
import app.nrksubtitlestudio.data.Store
import app.nrksubtitlestudio.data.Vtt
import app.nrksubtitlestudio.data.formatRate
import app.nrksubtitlestudio.data.isRtl
import app.nrksubtitlestudio.data.langName
import kotlinx.coroutines.delay
import kotlin.coroutines.cancellation.CancellationException

private val SHORT_MODE = mapOf("bilingual" to "Bilingual", "original" to "Original", "translated" to "Translation")
private val SHORT_LAYOUT = mapOf("side" to "Side panel", "bottom" to "Bottom", "off" to "Hidden")

fun formatTime(sec: Double): String {
    val s = maxOf(0, sec.toInt())
    val h = s / 3600
    val m = (s % 3600) / 60
    val r = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, r) else "%d:%02d".format(m, r)
}

private fun Long.toSec(): Double = if (this > 0) this / 1000.0 else 0.0

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/** Height of the player bar; captions always sit just above it so they never move or hide. */
private val BAR_H = 40.dp
private val CAPTION_BOTTOM = 44.dp

/** Slim seek bar: tap or drag to scrub; `onScrubEnd` commits. */
@Composable
private fun SeekBar(fraction: Float, onScrub: (Float) -> Unit, onScrubEnd: () -> Unit, modifier: Modifier = Modifier) {
    val scrub by rememberUpdatedState(onScrub)
    val end by rememberUpdatedState(onScrubEnd)
    var active by remember { mutableStateOf(false) }
    Canvas(
        modifier
            .height(28.dp)
            .pointerInput(Unit) {
                detectTapGestures(onTap = { o ->
                    scrub((o.x / size.width).coerceIn(0f, 1f))
                    end()
                })
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { o ->
                        active = true
                        scrub((o.x / size.width).coerceIn(0f, 1f))
                    },
                    onDragEnd = {
                        active = false
                        end()
                    },
                    onDragCancel = {
                        active = false
                        end()
                    },
                ) { change, _ -> scrub((change.position.x / size.width).coerceIn(0f, 1f)) }
            },
    ) {
        val y = size.height / 2
        val h = 3.dp.toPx()
        val x = size.width * fraction.coerceIn(0f, 1f)
        drawRoundRect(Color(0x55FFFFFF), Offset(0f, y - h / 2), Size(size.width, h), androidx.compose.ui.geometry.CornerRadius(h / 2))
        drawRoundRect(Colors.Accent, Offset(0f, y - h / 2), Size(x, h), androidx.compose.ui.geometry.CornerRadius(h / 2))
        drawCircle(Colors.Accent, if (active) 7.dp.toPx() else 5.dp.toPx(), Offset(x, y))
    }
}

/** Four corner brackets: pointing out = enter full screen, pointing in = leave it. */
@Composable
private fun FullscreenIcon(exit: Boolean) {
    Canvas(Modifier.size(16.dp)) {
        val s = size.minDimension
        val l = s * 0.34f
        val w = 2.dp.toPx()
        val c = Color.White
        val corners = listOf(Offset(0f, 0f) to Offset(1f, 1f), Offset(s, 0f) to Offset(-1f, 1f), Offset(0f, s) to Offset(1f, -1f), Offset(s, s) to Offset(-1f, -1f))
        for ((p, dir) in corners) {
            if (!exit) {
                drawLine(c, p, Offset(p.x + dir.x * l, p.y), w)
                drawLine(c, p, Offset(p.x, p.y + dir.y * l), w)
            } else {
                val elbow = Offset(p.x + dir.x * l, p.y + dir.y * l)
                drawLine(c, elbow, Offset(p.x, elbow.y), w)
                drawLine(c, elbow, Offset(elbow.x, p.y), w)
            }
        }
    }
}

private fun <T> step(list: List<T>, current: T, dir: Int, wrap: Boolean): T {
    val i = list.indexOf(current).let { if (it < 0) 0 else it }
    val n = list.size
    return if (wrap) list[((i + dir) % n + n) % n] else list[(i + dir).coerceIn(0, n - 1)]
}

/**
 * Full-screen player with the rolling, translated subtitle panel.
 *
 * Tap the picture to pause / play. The bar along the bottom has ⚙ (options
 * strip: speed, subtitles, layout, text size, background opacity, repeat
 * line, start over),
 * play / pause and a seek bar. Speeds other than 1× use ExoPlayer's own
 * time-stretching, so voices keep their pitch.
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(kind: String, id: String, fallbackTitle: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val settings by Store.settings.collectAsState()
    val scope = rememberCoroutineScope()
    val player = remember {
        ExoPlayer.Builder(context)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
    }

    var pb by remember { mutableStateOf<Playback?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var cues by remember { mutableStateOf<List<Cue>>(emptyList()) }
    var sourceLang by remember { mutableStateOf("nb") }
    var note by remember { mutableStateOf("Loading subtitles…") }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var playing by remember { mutableStateOf(false) }
    var wantsPlay by remember { mutableStateOf(true) }
    var ended by remember { mutableStateOf(false) }
    var buffering by remember { mutableStateOf(true) }
    var controls by remember { mutableStateOf(true) }
    var poke by remember { mutableIntStateOf(0) }
    var strip by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var streamIdx by remember { mutableIntStateOf(0) }
    var dragging by remember { mutableStateOf(false) }
    var dragFrac by remember { mutableFloatStateOf(0f) }
    /** Landscape, picture fills the screen, subtitles as captions over it. */
    var fullscreen by remember { mutableStateOf(false) }
    val isLive = pb?.isLive == true

    fun start(p: Playback, i: Int, atMs: Long) {
        val s = p.streams[i]
        val item = MediaItem.Builder()
            .setUri(s.url)
            .setMimeType(if (s.format == "hls") MimeTypes.APPLICATION_M3U8 else MimeTypes.APPLICATION_MPD)
            .build()
        player.setMediaItem(item, atMs)
        player.prepare()
        player.playWhenReady = true
    }

    fun saveProgress() {
        if (kind == "program" && player.currentPosition > 0) {
            Store.recordProgress(id, player.currentPosition / 1000.0, player.duration.toSec())
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                wantsPlay = playWhenReady
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING
                ended = playbackState == Player.STATE_ENDED
                if (ended) {
                    if (kind == "program") Store.markWatched(id, player.duration.toSec())
                    controls = true
                }
            }

            override fun onPlayerError(e: PlaybackException) {
                val p = pb ?: return
                if (streamIdx + 1 < p.streams.size) {
                    streamIdx++
                    start(p, streamIdx, player.currentPosition)
                } else {
                    error = "The video could not be played (${e.errorCodeName}). Many NRK programmes can only be watched from Norway."
                }
            }
        }
        player.addListener(listener)
        onDispose {
            saveProgress()
            player.removeListener(listener)
            player.release()
        }
    }

    // Pause when the app goes to the background.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                player.pause()
                saveProgress()
            }
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }

    // Full screen while playing; keep the screen on while the picture moves.
    val activity = context.findActivity()
    DisposableEffect(activity) {
        val window = activity?.window
        val ctl = window?.let { WindowCompat.getInsetsController(it, it.decorView) }
        ctl?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        ctl?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose {
            ctl?.show(WindowInsetsCompat.Type.systemBars())
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }
    LaunchedEffect(fullscreen) {
        activity?.requestedOrientation =
            if (fullscreen) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
    val view: View = LocalView.current
    DisposableEffect(playing) {
        view.keepScreenOn = playing
        onDispose { view.keepScreenOn = false }
    }

    LaunchedEffect(kind, id) {
        try {
            val p = Nrk.playback(kind, id)
            pb = p
            val resume = if (kind == "program") Store.resumePoint(id) else 0.0
            start(p, 0, (resume * 1000).toLong())
            if (resume > 0) notice = "Resuming from ${formatTime(resume)}"
            val track = Nrk.pickSubtitleTrack(p.subtitles)
            if (track == null) {
                note = if (p.isLive) "Live channels have no subtitle file." else "This programme has no subtitles."
                return@LaunchedEffect
            }
            sourceLang = track.language.ifEmpty { "nb" }
            try {
                val list = Nrk.cues(track)
                cues = list
                if (list.isEmpty()) note = "The subtitle file is empty."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                note = "Subtitles could not be loaded."
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: NotPlayableException) {
            error = e.message
        } catch (e: Exception) {
            error = errorMessage(e)
        }
    }

    LaunchedEffect(notice) {
        if (notice != null) {
            delay(3500)
            notice = null
        }
    }

    // Position, plus a progress save every 10 s.
    LaunchedEffect(player) {
        var lastSave = 0L
        while (true) {
            positionMs = player.currentPosition
            durationMs = player.duration.coerceAtLeast(0)
            val now = System.currentTimeMillis()
            if (now - lastSave > 10_000 && positionMs > 0) {
                lastSave = now
                saveProgress()
            }
            delay(200)
        }
    }

    val rate = if (isLive) 1f else settings.playbackRate
    LaunchedEffect(rate) { player.setPlaybackSpeed(rate) }

    LaunchedEffect(controls, poke, playing, strip) {
        if (controls && playing && !strip) {
            delay(4000)
            controls = false
        }
    }

    // Translation
    val translationWanted = settings.targetLang != "off" && settings.displayMode != "original"
    val translator = remember(cues, settings.targetLang, translationWanted) {
        if (cues.isNotEmpty() && translationWanted) {
            CueTranslator(cues, sourceLang, settings.targetLang, scope) { Store.settings.value.deeplKey }
        } else {
            null
        }
    }
    DisposableEffect(translator) {
        translator?.focusOn(maxOf(0, Vtt.indexAt(cues, player.currentPosition / 1000.0)))
        onDispose { translator?.stop() }
    }
    val trVersion = translator?.version ?: 0
    val issue = translator?.let { trVersion; it.deeplIssue } ?: ""
    LaunchedEffect(issue) {
        if (issue.isNotEmpty()) Toast.makeText(context, "$issue: using Google Translate", Toast.LENGTH_LONG).show()
    }

    val t = positionMs / 1000.0
    val idx = Vtt.indexAt(cues, t)
    val active = idx >= 0 && t < cues[idx].end
    LaunchedEffect(idx, translator) { if (idx >= 0) translator?.focusOn(idx) }
    val rtl = isRtl(settings.targetLang)

    fun togglePlay() {
        if (ended) {
            player.seekTo(0)
            player.play()
        } else if (player.playWhenReady) {
            player.pause()
        } else {
            player.play()
        }
        controls = true
        poke++
    }

    fun seekTo(ms: Long) {
        val max = if (durationMs > 0) durationMs - 500 else Long.MAX_VALUE
        player.seekTo(ms.coerceIn(0, max))
        poke++
    }

    fun repeatLine() {
        val i = Vtt.indexAt(cues, player.currentPosition / 1000.0)
        if (i >= 0) {
            seekTo((cues[i].start * 1000).toLong() + 50)
            player.play()
        }
    }

    fun header(): String {
        if (!translationWanted || translator == null) return "NORSK"
        val pct = if (cues.isNotEmpty()) translator.done * 100 / cues.size else 0
        val prov = if (translator.failed) "TRANSLATION UNAVAILABLE" else translator.provider?.uppercase() ?: "TRANSLATING…"
        return "NORSK → ${langName(settings.targetLang)} · $prov" + if (pct < 100 && !translator.failed) " · $pct%" else ""
    }

    BackHandler(enabled = strip) { strip = false }
    BackHandler(enabled = fullscreen && !strip) { fullscreen = false }

    val showTransFor: (String?) -> Boolean = { tr -> translationWanted && !(tr == null && translator?.failed == true) }

    val cueLine: @Composable (Int, Cue) -> Unit = { i, cue ->
        trVersion
        val tr = translator?.out?.getOrNull(i)
        val showTrans = showTransFor(tr)
        val showOrig = settings.displayMode != "translated" || !showTrans
        val current = i == idx
        val past = i < idx
        val fs = settings.fontSize
        Column(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 2.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (current && active) Color(0xFF24305A) else if (current) Color(0xFF1A2035) else Color.Transparent)
                .drawBehind { if (current && active) drawRect(Colors.Accent, size = Size(4.dp.toPx(), size.height)) }
                .clickable {
                    seekTo((cue.start * 1000).toLong() + 50)
                    if (!player.playWhenReady) player.play()
                }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            if (showOrig) {
                Text(cue.text, fontSize = fs.sp, lineHeight = (fs * 1.25).sp, color = if (past) Color(0xFF7D849A) else Color.White)
            }
            if (showTrans) {
                Text(
                    tr ?: "…",
                    Modifier.fillMaxWidth().padding(top = if (showOrig) 2.dp else 0.dp),
                    fontSize = fs.sp,
                    lineHeight = (fs * 1.3).sp,
                    color = if (tr == null) Colors.Muted else if (past) Color(0xFFB39758) else Colors.Translation,
                    style = TextStyle(textDirection = if (rtl) TextDirection.Rtl else TextDirection.Content),
                )
            }
        }
    }

    val subtitlePanel: @Composable (Modifier) -> Unit = { m ->
        Column(m.background(Color(0xFF0F121B))) {
            Text(header(), Modifier.padding(horizontal = 14.dp, vertical = 10.dp), color = Colors.Muted, fontSize = 12.sp, maxLines = 2)
            HorizontalDivider(color = Color(0xFF232A3D))
            if (cues.isEmpty()) {
                Text(note, Modifier.padding(16.dp), color = Colors.Muted, fontSize = 15.sp)
            } else {
                val listState = rememberLazyListState()
                var userScrollAt by remember { mutableLongStateOf(0L) }
                LaunchedEffect(listState) {
                    listState.interactionSource.interactions.collect {
                        if (it is DragInteraction.Start) userScrollAt = System.currentTimeMillis()
                    }
                }
                LaunchedEffect(idx) {
                    if (idx >= 0 && System.currentTimeMillis() - userScrollAt > 5000) listState.animateScrollToItem(maxOf(0, idx - 1))
                }
                LazyColumn(state = listState, modifier = Modifier.weight(1f), contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 240.dp)) {
                    itemsIndexed(cues) { i, cue -> cueLine(i, cue) }
                }
            }
        }
    }

    val captions: @Composable (Modifier) -> Unit = { m ->
        if (active) {
            val cue = cues[idx]
            trVersion
            val tr = translator?.out?.getOrNull(idx)
            val showTrans = showTransFor(tr) && tr != null
            val showOrig = settings.displayMode != "translated" || !showTrans
            // Little or no background: an outline keeps captions readable on bright pictures.
            val shadow = if (settings.subtitleBg <= 30) Shadow(Color.Black, Offset(0f, 2f), 8f) else null
            Column(
                m.widthIn(max = 900.dp).clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = settings.subtitleBg / 100f))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (showOrig) {
                    Text(
                        cue.text,
                        fontSize = settings.fontSize.sp,
                        lineHeight = (settings.fontSize * 1.25).sp,
                        textAlign = TextAlign.Center,
                        style = TextStyle(shadow = shadow),
                    )
                }
                if (showTrans) {
                    Text(
                        tr!!,
                        fontSize = settings.fontSize.sp,
                        lineHeight = (settings.fontSize * 1.3).sp,
                        color = Colors.Translation,
                        textAlign = TextAlign.Center,
                        style = TextStyle(shadow = shadow, textDirection = if (rtl) TextDirection.Rtl else TextDirection.Content),
                    )
                }
            }
        }
    }

    val ctrlButton: @Composable (String, String, () -> Unit) -> Unit = { label, tag, onClick ->
        Box(
            Modifier.size(36.dp).clip(CircleShape).clickable(onClickLabel = tag, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) { Text(label, fontSize = if (label.length > 2) 13.sp else 16.sp, color = Color.White, fontWeight = FontWeight.SemiBold) }
    }

    val controlBar: @Composable (Modifier) -> Unit = { m ->
        Row(
            m.fillMaxWidth()
                .height(BAR_H)
                .background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0xD9000000))))
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!isLive) ctrlButton("⚙", "Options") {
                strip = true
                poke++
            }
            ctrlButton(if (wantsPlay && !ended) "❚❚" else "▶", "Play or pause") { togglePlay() }
            if (isLive) {
                Text("LIVE", Modifier.padding(horizontal = 10.dp).weight(1f), color = Colors.Live, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            } else {
                Text(formatTime(if (dragging) dragFrac * durationMs.toSec() else t), Modifier.padding(start = 4.dp), fontSize = 11.sp, color = Color(0xFFD5D8E3))
                val frac = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
                SeekBar(
                    fraction = if (dragging) dragFrac else frac,
                    onScrub = {
                        dragging = true
                        dragFrac = it
                        poke++
                    },
                    onScrubEnd = {
                        seekTo((dragFrac * durationMs).toLong())
                        dragging = false
                    },
                    modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                )
                Text(formatTime(durationMs.toSec()), fontSize = 11.sp, color = Color(0xFFD5D8E3))
            }
            if (rate != 1f) SmallBadge(formatRate(rate), Color(0xFF2B3550))
            Box(
                Modifier.size(36.dp).clip(CircleShape)
                    .semantics { contentDescription = if (fullscreen) "Leave full screen" else "Full screen" }
                    .clickable {
                    fullscreen = !fullscreen
                    poke++
                },
                contentAlignment = Alignment.Center,
            ) { FullscreenIcon(exit = fullscreen) }
        }
    }

    val stripItem: @Composable (String, String, (Int) -> Unit) -> Unit = { label, value, change ->
        Row(Modifier.height(36.dp).clip(RoundedCornerShape(8.dp)).background(Colors.SurfaceHigh), verticalAlignment = Alignment.CenterVertically) {
            Text("‹", Modifier.clickable { change(-1) }.padding(horizontal = 10.dp, vertical = 4.dp), fontSize = 18.sp)
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(label, fontSize = 9.sp, lineHeight = 10.sp, color = Colors.Muted)
                Text(value, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("›", Modifier.clickable { change(1) }.padding(horizontal = 10.dp, vertical = 4.dp), fontSize = 18.sp)
        }
    }
    val stripAction: @Composable (String, () -> Unit) -> Unit = { label, onClick ->
        Text(
            label,
            Modifier.height(36.dp).clip(RoundedCornerShape(8.dp)).background(Colors.SurfaceHigh).clickable(onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 9.dp),
            fontSize = 12.sp,
        )
    }

    val optionsStrip: @Composable (Modifier) -> Unit = { m ->
        Row(
            m.fillMaxWidth().height(BAR_H + 4.dp).background(Color(0xF00F121B)).horizontalScroll(rememberScrollState()).padding(horizontal = 6.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            stripItem("Speed", formatRate(settings.playbackRate)) { d ->
                Store.updateSettings { it.copy(playbackRate = step(SPEEDS, it.playbackRate, d, wrap = false)) }
            }
            stripItem("Subtitles", SHORT_MODE[settings.displayMode] ?: settings.displayMode) { d ->
                Store.updateSettings { it.copy(displayMode = step(DISPLAY_MODES.map { m -> m.first }, it.displayMode, d, wrap = true)) }
                if (settings.targetLang == "off") Toast.makeText(context, "Choose a translation language in Settings", Toast.LENGTH_SHORT).show()
            }
            stripItem("Layout", SHORT_LAYOUT[settings.layout] ?: settings.layout) { d ->
                Store.updateSettings { it.copy(layout = step(LAYOUTS.map { l -> l.first }, it.layout, d, wrap = true)) }
            }
            stripItem("Text size", settings.fontSize.toString()) { d ->
                Store.updateSettings { it.copy(fontSize = step(FONT_SIZES, it.fontSize, d, wrap = false)) }
            }
            stripItem("Background opacity", formatBg(settings.subtitleBg)) { d ->
                Store.updateSettings { it.copy(subtitleBg = step(SUBTITLE_BGS, it.subtitleBg, d, wrap = false)) }
            }
            if (cues.isNotEmpty()) stripAction("↺ Repeat line") {
                strip = false
                repeatLine()
            }
            stripAction("⏮ Start over") {
                strip = false
                seekTo(0)
                player.play()
            }
            stripAction("✕") { strip = false }
        }
    }

    val videoArea: @Composable (Modifier, Boolean) -> Unit = { m, withCaptions ->
        Box(m.background(Color.Black)) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        subtitleView?.visibility = View.GONE
                        this.player = player
                    }
                },
                modifier = Modifier.fillMaxSize(),
                onRelease = { it.player = null },
            )
            // Tapping the picture pauses / resumes (or closes the options strip).
            Box(
                Modifier.fillMaxSize().pointerInput(Unit) {
                    detectTapGestures(onTap = {
                        if (strip) strip = false else togglePlay()
                    })
                },
            )
            if (withCaptions) captions(Modifier.align(Alignment.BottomCenter).padding(start = 16.dp, end = 16.dp, bottom = CAPTION_BOTTOM))
            if (buffering && error == null) CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
            AnimatedVisibility(controls || strip, Modifier.align(Alignment.TopStart).fillMaxWidth(), enter = fadeIn(), exit = fadeOut()) {
                Row(
                    Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0xCC000000), Color.Transparent))).padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ctrlButton("←", "Back", onBack)
                    Column(Modifier.padding(start = 4.dp)) {
                        Text(pb?.title?.takeIf { it != id } ?: fallbackTitle, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        val sub = pb?.subtitle ?: ""
                        if (sub.isNotEmpty()) Text(sub, fontSize = 12.sp, color = Color(0xFFC5CADB), maxLines = 1)
                    }
                }
            }
            AnimatedVisibility(controls && !strip, Modifier.align(Alignment.BottomCenter), enter = fadeIn(), exit = fadeOut()) {
                controlBar(Modifier)
            }
            if (strip) optionsStrip(Modifier.align(Alignment.BottomCenter))
            notice?.let {
                Text(
                    it,
                    Modifier.align(Alignment.TopCenter).padding(top = 64.dp).clip(RoundedCornerShape(20.dp))
                        .background(Color(0xE61F2638)).padding(horizontal = 16.dp, vertical = 8.dp),
                    fontSize = 14.sp,
                )
            }
            error?.let {
                Column(
                    Modifier.align(Alignment.Center).padding(24.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xF0151A26)).padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(it, textAlign = TextAlign.Center)
                    Button(onClick = onBack, Modifier.padding(top = 12.dp)) { Text("Back") }
                }
            }
        }
    }

    val config = LocalConfiguration.current
    val landscape = config.screenWidthDp > config.screenHeightDp
    val layout = if (isLive) "off" else settings.layout
    Box(Modifier.fillMaxSize().background(Color.Black).windowInsetsPadding(WindowInsets.displayCutout)) {
        when {
            fullscreen -> videoArea(Modifier.fillMaxSize(), layout != "off")
            layout == "side" && landscape -> Row(Modifier.fillMaxSize()) {
                videoArea(Modifier.weight(0.62f).fillMaxHeight(), false)
                subtitlePanel(Modifier.weight(0.38f).fillMaxHeight())
            }
            layout == "side" -> Column(Modifier.fillMaxSize()) {
                videoArea(Modifier.fillMaxWidth().aspectRatio(16f / 9f), false)
                subtitlePanel(Modifier.weight(1f).fillMaxWidth())
            }
            else -> videoArea(Modifier.fillMaxSize(), layout == "bottom")
        }
    }
}
