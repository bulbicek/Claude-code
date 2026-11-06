package sk.pexeso.politici

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import sk.pexeso.politici.engine.GameConfig
import sk.pexeso.politici.engine.Mode
import sk.pexeso.politici.ui.CreditsScreen
import sk.pexeso.politici.ui.GameScreen
import sk.pexeso.politici.ui.LoadingScreen
import sk.pexeso.politici.ui.MenuScreen
import sk.pexeso.politici.ui.PolitTheme
import sk.pexeso.politici.ui.QuizScreen
import sk.pexeso.politici.ui.SetupScreen

sealed interface Screen {
    data object Menu : Screen
    data class Setup(val mode: Mode) : Screen
    data class Game(val config: GameConfig, val round: Int) : Screen
    data object Quiz : Screen
    data object Credits : Screen
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PolitTheme { App() } }
    }
}

@Composable
private fun App() {
    val ctx = LocalContext.current
    val store = remember { Store(ctx.applicationContext) }
    var data by remember { mutableStateOf<AppData?>(null) }
    var screen by remember { mutableStateOf<Screen>(Screen.Menu) }

    LaunchedEffect(Unit) {
        data = withContext(Dispatchers.IO) { AppData.load(ctx.applicationContext) }
    }
    BackHandler(enabled = screen != Screen.Menu) { screen = Screen.Menu }

    val d = data
    if (d == null) {
        LoadingScreen()
        return
    }
    when (val s = screen) {
        Screen.Menu -> MenuScreen(
            data = d,
            onMode = { screen = Screen.Setup(it) },
            onQuiz = { screen = Screen.Quiz },
            onCredits = { screen = Screen.Credits },
        )
        is Screen.Setup -> SetupScreen(
            mode = s.mode, store = store,
            onStart = { screen = Screen.Game(it, 0) },
            onBack = { screen = Screen.Menu },
        )
        is Screen.Game -> key(s.round) {
            GameScreen(
                config = s.config, data = d, store = store,
                onRestart = { screen = Screen.Game(s.config, s.round + 1) },
                onExit = { screen = Screen.Menu },
            )
        }
        Screen.Quiz -> QuizScreen(data = d, store = store, onExit = { screen = Screen.Menu })
        Screen.Credits -> CreditsScreen(data = d, onBack = { screen = Screen.Menu })
    }
}
