package app.nrksubtitlestudio.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.nrksubtitlestudio.data.Card
import app.nrksubtitlestudio.data.CardCache
import app.nrksubtitlestudio.data.CardKind
import android.net.Uri

object Colors {
    val Background = Color(0xFF0B0D14)
    val Surface = Color(0xFF151A26)
    val SurfaceHigh = Color(0xFF1F2638)
    val Accent = Color(0xFF4F8CFF)
    val Muted = Color(0xFF8F96AD)
    val Translation = Color(0xFFFFD479)
    val Live = Color(0xFFE3262F)
}

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Colors.Accent,
            onPrimary = Color.White,
            secondary = Colors.Accent,
            background = Colors.Background,
            onBackground = Color.White,
            surface = Colors.Surface,
            onSurface = Color.White,
            surfaceVariant = Colors.SurfaceHigh,
            onSurfaceVariant = Color(0xFFC5CADB),
            surfaceContainer = Colors.Surface,
            secondaryContainer = Colors.SurfaceHigh,
        ),
    ) {
        Surface(Modifier.fillMaxSize(), color = Colors.Background, content = content)
    }
}

/** Open a card the way the TV app does: series → series page, programme → details, channel → player. */
fun NavHostController.openCard(card: Card, play: Boolean = false) {
    CardCache.put(card)
    when (card.kind) {
        CardKind.SERIES -> navigate("series/${Uri.encode(card.id)}")
        CardKind.PROGRAM -> if (play) openPlayer("program", card.id, card.title) else navigate("details/${Uri.encode(card.id)}")
        CardKind.CHANNEL -> openPlayer("channel", card.id, card.title)
    }
}

fun NavHostController.openPlayer(kind: String, id: String, title: String) {
    navigate("player/$kind/${Uri.encode(id)}?title=${Uri.encode(title)}")
}

@Composable
fun AppNav() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "home") {
        composable("home") { HomeScreen(nav) }
        composable("series/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) {
            SeriesScreen(nav, it.arguments?.getString("id").orEmpty())
        }
        composable("details/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) {
            DetailsScreen(nav, it.arguments?.getString("id").orEmpty())
        }
        composable(
            "player/{kind}/{id}?title={title}",
            arguments = listOf(
                navArgument("kind") { type = NavType.StringType },
                navArgument("id") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType; defaultValue = "" },
            ),
        ) {
            PlayerScreen(
                kind = it.arguments?.getString("kind").orEmpty(),
                id = it.arguments?.getString("id").orEmpty(),
                fallbackTitle = it.arguments?.getString("title").orEmpty(),
                onBack = { nav.popBackStack() },
            )
        }
    }
}
