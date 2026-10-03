package app.nrksubtitlestudio.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nrksubtitlestudio.BuildConfig
import app.nrksubtitlestudio.data.DISPLAY_MODES
import app.nrksubtitlestudio.data.DeepL
import app.nrksubtitlestudio.data.FONT_SIZES
import app.nrksubtitlestudio.data.LANGS
import app.nrksubtitlestudio.data.LAYOUTS
import app.nrksubtitlestudio.data.SPEEDS
import app.nrksubtitlestudio.data.SUBTITLE_BGS
import app.nrksubtitlestudio.data.formatBg
import app.nrksubtitlestudio.data.Store
import app.nrksubtitlestudio.data.formatRate
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(onOpenGuide: (() -> Unit)?) {
    val s by Store.settings.collectAsState()
    val scope = rememberCoroutineScope()
    var key by remember { mutableStateOf(s.deeplKey) }
    var showKey by remember { mutableStateOf(false) }
    var deeplStatus by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 8.dp)) {
        Text("Settings", Modifier.padding(8.dp), fontSize = 22.sp, fontWeight = FontWeight.Bold)
        if (onOpenGuide != null) {
            OutlinedButton(onClick = onOpenGuide, Modifier.padding(horizontal = 8.dp)) { Text("?  Guide: tips and tricks") }
        }
        ChoiceRow("Translate subtitles to", LANGS, s.targetLang) { v -> Store.updateSettings { it.copy(targetLang = v) } }
        ChoiceRow("Show", DISPLAY_MODES, s.displayMode) { v -> Store.updateSettings { it.copy(displayMode = v) } }
        ChoiceRow("Subtitle layout", LAYOUTS, s.layout) { v -> Store.updateSettings { it.copy(layout = v) } }
        ChoiceRow("Subtitle size", FONT_SIZES.map { it to "$it sp" }, s.fontSize) { v -> Store.updateSettings { it.copy(fontSize = v) } }
        ChoiceRow("Subtitle background opacity", SUBTITLE_BGS.map { it to formatBg(it) }, s.subtitleBg) { v ->
            Store.updateSettings { it.copy(subtitleBg = v) }
        }
        ChoiceRow("Playback speed", SPEEDS.map { it to if (it == 1f) "Normal (1×)" else formatRate(it) }, s.playbackRate) { v ->
            Store.updateSettings { it.copy(playbackRate = v) }
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Text("DeepL API key", Modifier.padding(horizontal = 12.dp), fontSize = 16.sp)
        Text(
            "Optional. With a key (the free DeepL API plan works) subtitles are translated with DeepL; without one, or if the key fails, Google Translate is used.",
            Modifier.padding(horizontal = 12.dp, vertical = 4.dp), color = Colors.Muted, fontSize = 13.sp,
        )
        OutlinedTextField(
            value = key,
            onValueChange = {
                key = it
                Store.updateSettings { st -> st.copy(deeplKey = it.trim()) }
                deeplStatus = ""
            },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            singleLine = true,
            placeholder = { Text("xxxxxxxx-xxxx-…:fx") },
            visualTransformation = if (showKey) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = { TextButton(onClick = { showKey = !showKey }) { Text(if (showKey) "Hide" else "Show") } },
        )
        Row(Modifier.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = {
                deeplStatus = "Checking…"
                scope.launch { deeplStatus = DeepL.check(key) }
            }) { Text("Test DeepL key") }
        }
        if (deeplStatus.isNotEmpty()) Text(deeplStatus, Modifier.padding(horizontal = 12.dp), fontSize = 14.sp)
        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Text("NRK Subtitle Studio for Android · v${BuildConfig.VERSION_NAME}", Modifier.padding(horizontal = 12.dp), color = Colors.Muted, fontSize = 13.sp)
        Text(
            "Not affiliated with NRK. Translations by DeepL (with your API key) or Google Translate.",
            Modifier.padding(12.dp), color = Colors.Muted, fontSize = 13.sp,
        )
    }
}

private val GUIDE: List<Pair<String, List<String>>> = listOf(
    "Getting around" to listOf(
        "Use the menu (bottom bar on phones, left rail on tablets) for Front page, Favourites, Live TV, Search and Settings.",
        "On the Front page, swipe the big picture to browse featured programmes. ▶ Watch starts right away, Info opens the details.",
        "Use the system Back gesture or button to go back.",
    ),
    "Favourites" to listOf(
        "Save a series or film with ☆ Add to favourites on its page.",
        "Favouriting an episode saves its series, so new episodes are always one tap away.",
        "Tap ✕ on a tile in Favourites to remove it.",
    ),
    "Programmes and series" to listOf(
        "Films and episodes open a details page first. Tap ▶ Watch to start, or ☰ All episodes to see the series.",
        "On a series page, pick a season, then tap an episode to play it.",
        "Programmes remember where you stopped and continue from there next time.",
    ),
    "Watched and in progress" to listOf(
        "A blue bar under a picture shows how much of that film or episode you have seen.",
        "“✓ Watched” marks the ones you have finished (reaching the end credits counts).",
        "On a details page, ▶ Continue picks up where you stopped and ↺ Watch again starts from the beginning.",
        "Use ✓ Mark as watched (or Mark as not watched) on the details page to change it yourself.",
    ),
    "During playback" to listOf(
        "Tap the picture to pause, tap again to play. The controls appear while paused and fade away while playing.",
        "Drag the bar to jump to any point.",
        "Tap a line in the subtitle list to jump to it. Great for listening to a sentence again.",
        "Turn the phone sideways for a bigger picture with the subtitle list beside it.",
        "Tap the corners icon at the right of the player bar for full screen: the picture turns sideways and fills the screen, with subtitles as captions over it. Tap it again or press Back to return.",
    ),
    "Options strip (⚙)" to listOf(
        "Tap ⚙ in the player bar to open a slim strip along the bottom: Speed, Subtitles, Layout, Text size and Background opacity, each with ‹ › to change it.",
        "↺ Repeat line replays the current line. ⏮ Start over plays from the beginning.",
        "Tap ✕ (or the picture) to close the strip. Changes are saved right away.",
    ),
    "Playback speed" to listOf(
        "Slow programmes down (0.95× to 0.65×) or speed them up (1.05× to 1.4×) with Speed in the options strip or under Settings → Playback speed.",
        "Tip for learners: 0.85× or 0.9× makes fast speech easier to follow without sounding unnatural.",
        "Voices keep their natural pitch, and the sound stays in sync with the picture.",
        "The speed is remembered for the next programme. The player bar shows it when it isn't 1×. Live TV always plays at normal speed.",
    ),
    "Subtitles" to listOf(
        "Bilingual shows Norwegian with the translation underneath. You can also show only the original or only the translation.",
        "Layout: Side panel shows a scrolling list of lines beside (or, held upright, below) the picture. Bottom shows classic captions. Hidden turns them off.",
        "Text size goes from 14 to 40 sp.",
        "Subtitle background opacity (in Settings or the options strip) sets how dark the box behind bottom captions is: 0 % shows outlined text only, 100 % a solid box.",
        "Right-to-left languages such as Persian, Arabic, Urdu and Kurdish (Sorani) are shown right to left.",
        "Live channels don't have subtitle files, so no subtitles are shown there.",
    ),
    "Translation" to listOf(
        "Choose the language under Settings → Translate subtitles to. Choose “No translation” to see Norwegian only.",
        "Translations come from Google Translate by default. For better translations, add a DeepL API key in Settings and tap Test DeepL key.",
        "DeepL covers almost every language in the list, including Persian, Arabic, Urdu, Kurdish, Turkish and Ukrainian. Somali and Tigrinya always use Google Translate.",
        "If the DeepL key is missing, wrong or out of quota, the app uses Google Translate automatically.",
        "The subtitle panel header shows which service is translating and how far it has come.",
    ),
    "If something doesn't work" to listOf(
        "Many NRK programmes can only be watched from Norway.",
        "Check your internet connection, then go back and open the programme again.",
    ),
)

@Composable
fun GuideScreen(onBack: (() -> Unit)?) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onBack != null) Text("←", Modifier.clickable(onClick = onBack).padding(end = 12.dp), fontSize = 22.sp)
                Text("Guide", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            Text("Tips and tricks", color = Colors.Muted, fontSize = 14.sp)
        }
        items(GUIDE) { (title, tips) ->
            Column(Modifier.padding(top = 18.dp)) {
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Colors.Accent)
                tips.forEach { Text("•  $it", Modifier.padding(top = 6.dp), fontSize = 15.sp, lineHeight = 21.sp) }
            }
        }
    }
}
