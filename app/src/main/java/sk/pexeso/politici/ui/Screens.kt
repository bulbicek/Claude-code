package sk.pexeso.politici.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import sk.pexeso.politici.AppData
import sk.pexeso.politici.Store
import sk.pexeso.politici.engine.Difficulty
import sk.pexeso.politici.engine.GameConfig
import sk.pexeso.politici.engine.Mode
import sk.pexeso.politici.engine.PairType

@Composable
fun LoadingScreen() = Backdrop {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Načítavam politikov…", color = Color.White, fontSize = 18.sp)
    }
}

@Composable
fun MenuScreen(data: AppData, onMode: (Mode) -> Unit, onQuiz: () -> Unit, onCredits: () -> Unit) = Backdrop {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(16.dp))
        Text("POLIT", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Black, letterSpacing = 6.sp)
        Text("PEXESO", color = C.Red, fontSize = 44.sp, fontWeight = FontWeight.Black, letterSpacing = 6.sp)
        Text("Spoznaj tváre slovenskej politiky", color = C.TextDim, fontSize = 15.sp)
        Spacer(Modifier.height(24.dp))

        Mode.values().forEach { m ->
            MenuTile(m.emoji, m.title, m.subtitle) { onMode(m) }
            Spacer(Modifier.height(10.dp))
        }
        val quizOk = data.withPhotos.size >= 4
        MenuTile("🧠", "Spoznaj politika", if (quizOk) "Kvíz: kto je na fotke?" else "Kvíz vyžaduje fotky (pozri README)") {
            if (quizOk) onQuiz()
        }
        Spacer(Modifier.height(18.dp))
        PillButton("Zdroje fotiek a licencie", primary = false, onClick = onCredits)
        Spacer(Modifier.height(14.dp))
        Text(
            "Nezávislá zábavná aplikácia. Nie je spojená so žiadnou stranou ani kandidátom a nijako nehodnotí politikov.",
            color = C.TextDim, fontSize = 12.sp, textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun MenuTile(emoji: String, title: String, subtitle: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(C.Card)
            .border(1.dp, Color.White.copy(alpha = 0.18f), shape)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 30.sp)
        Spacer(Modifier.size(14.dp))
        Column {
            Text(title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = C.TextDim, fontSize = 13.sp)
        }
    }
}

@Composable
fun SetupScreen(mode: Mode, store: Store, onStart: (GameConfig) -> Unit, onBack: () -> Unit) = Backdrop {
    var diff by remember { mutableStateOf(Difficulty.MEDIUM) }
    var pairType by remember { mutableStateOf(PairType.PHOTO_PHOTO) }
    var players by remember { mutableIntStateOf(2) }
    val config = GameConfig(mode, diff, pairType, if (mode == Mode.DUEL) players else 1)

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(20.dp)) {
        Text("‹ Späť", color = C.TextDim, fontSize = 16.sp, modifier = Modifier.clickable(onClick = onBack).padding(vertical = 6.dp))
        Spacer(Modifier.height(8.dp))
        Text("${mode.emoji} ${mode.title}", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black)
        Text(mode.subtitle, color = C.TextDim, fontSize = 14.sp)
        Spacer(Modifier.height(22.dp))

        Label("Obtiažnosť")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Difficulty.values().forEach {
                Chip("${it.label}\n${it.pairs} párov", it == diff, Modifier.weight(1f)) { diff = it }
            }
        }
        Spacer(Modifier.height(18.dp))

        Label("Typ párov")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PairType.values().forEach { Chip(it.label, it == pairType, Modifier.weight(1f)) { pairType = it } }
        }
        if (mode == Mode.DUEL) {
            Spacer(Modifier.height(18.dp))
            Label("Počet hráčov")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (2..4).forEach { Chip("$it hráči", it == players, Modifier.weight(1f)) { players = it } }
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(rulesText(config), color = C.TextDim, fontSize = 13.sp)
        val best = store.best(config.key)
        if (best > 0 && mode != Mode.DUEL) {
            Spacer(Modifier.height(6.dp))
            Text("🏆 Rekord: $best bodov", color = C.Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(24.dp))
        PillButton("Hrať", Modifier.fillMaxWidth()) { onStart(config) }
    }
}

private fun rulesText(c: GameConfig): String = when (c.mode) {
    Mode.CLASSIC -> "Nájdi všetky páry. Čím menej ťahov a času, tým viac bodov. Zhoda za zhodou dáva sériový bonus."
    Mode.TIMED -> "Máš ${c.timeLimitMs / 1000} s. Každá zhoda pridá 3 s navyše."
    Mode.MOVES -> "Máš ${c.moveLimit} ťahov na ${c.difficulty.pairs} párov. Nezostane veľa miesta na omyly."
    Mode.DUEL -> "Hráči sa striedajú. Kto nájde pár, hrá znova. Vyhráva najviac bodov."
}

@Composable
private fun Label(text: String) {
    Text(text.uppercase(), color = C.Gold, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
fun CreditsScreen(data: AppData, onBack: () -> Unit) = Backdrop {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(20.dp)) {
        Text("‹ Späť", color = C.TextDim, fontSize = 16.sp, modifier = Modifier.clickable(onClick = onBack).padding(vertical = 6.dp))
        Spacer(Modifier.height(8.dp))
        Text("Zdroje fotiek", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        Text(
            "Fotky pochádzajú z Wikimedia Commons a sú pod slobodnými licenciami (CC alebo verejná doména). " +
                "Autori a licencie sú uvedení nižšie.",
            color = C.TextDim, fontSize = 13.sp,
        )
        Spacer(Modifier.height(16.dp))
        if (data.credits.isEmpty()) {
            Text(
                "V tejto zostave nie sú žiadne fotky. Spusti tools/fetch_photos.py a aplikáciu znova zostav; " +
                    "dovtedy hra používa náhradné portréty s iniciálami.",
                color = Color.White, fontSize = 14.sp,
            )
        }
        data.credits.forEach {
            Column(Modifier.padding(vertical = 6.dp)) {
                Text(it.politicianName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text("${it.author} · ${it.license}", color = C.TextDim, fontSize = 12.sp)
                Text(it.source, color = C.BlueLight, fontSize = 11.sp)
            }
        }
    }
}
