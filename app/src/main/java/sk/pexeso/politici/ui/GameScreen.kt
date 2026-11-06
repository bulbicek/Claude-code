package sk.pexeso.politici.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import sk.pexeso.politici.AppData
import sk.pexeso.politici.Store
import sk.pexeso.politici.engine.CardState
import sk.pexeso.politici.engine.Engine
import sk.pexeso.politici.engine.GameConfig
import sk.pexeso.politici.engine.GameState
import sk.pexeso.politici.engine.Mode
import sk.pexeso.politici.engine.PairType

private enum class Status { READY, PLAYING, WON, LOST }

private const val PREVIEW_MS = 2000L
private const val TIME_BONUS_PER_MATCH_MS = 3000L

@Composable
fun GameScreen(
    config: GameConfig,
    data: AppData,
    store: Store,
    onRestart: () -> Unit,
    onExit: () -> Unit,
) = Backdrop {
    val scope = rememberCoroutineScope()
    val cards = remember { Engine.deal(data.politicians.map { it.id }, config.difficulty.pairs, config.pairType) }
    var state by remember { mutableStateOf(Engine.newGame(cards, config.players)) }
    var status by remember { mutableStateOf(Status.READY) }
    var preview by remember { mutableStateOf(true) }
    var elapsedMs by remember { mutableLongStateOf(0L) }
    var bonusMs by remember { mutableLongStateOf(0L) }
    var finalScore by remember { mutableIntStateOf(0) }
    var isRecord by remember { mutableStateOf(false) }

    val timeLeftMs = config.timeLimitMs + bonusMs - elapsedMs

    fun finish(won: Boolean, s: GameState) {
        val base = s.scores[0]
        val leftMs = config.timeLimitMs + bonusMs - elapsedMs
        val score = if (!won) base else when (config.mode) {
            Mode.CLASSIC -> base + maxOf(0L, (s.pairs * 6000L - elapsedMs) / 100).toInt()
            Mode.TIMED -> base + maxOf(0L, leftMs / 100).toInt()
            Mode.MOVES -> base + (config.moveLimit - s.moves) * 20
            Mode.DUEL -> base
        }
        finalScore = score
        if (won && config.mode != Mode.DUEL) isRecord = store.submit(config.key, score)
        status = if (won) Status.WON else Status.LOST
    }

    LaunchedEffect(Unit) {
        delay(PREVIEW_MS)
        preview = false
    }

    LaunchedEffect(status) {
        if (status != Status.PLAYING) return@LaunchedEffect
        var last = System.nanoTime()
        while (true) {
            delay(100)
            val now = System.nanoTime()
            elapsedMs += (now - last) / 1_000_000
            last = now
            if (config.mode == Mode.TIMED && config.timeLimitMs + bonusMs - elapsedMs <= 0) {
                finish(false, state)
                break
            }
        }
    }

    fun onCardClick(i: Int) {
        if (preview || (status != Status.READY && status != Status.PLAYING)) return
        val before = state
        val next = Engine.flip(before, i)
        if (next === before) return
        state = next
        if (status == Status.READY) status = Status.PLAYING
        if (next.awaitingResolve) {
            scope.launch {
                delay(if (next.pendingMatch) 550 else 950)
                val resolved = Engine.resolve(next)
                state = resolved
                if (status != Status.PLAYING) return@launch
                if (resolved.pairsFound > next.pairsFound && config.mode == Mode.TIMED) bonusMs += TIME_BONUS_PER_MATCH_MS
                when {
                    resolved.finished -> finish(true, resolved)
                    config.mode == Mode.MOVES && resolved.moves >= config.moveLimit -> finish(false, resolved)
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("‹", color = Color.White, fontSize = 30.sp, modifier = Modifier.clickable(onClick = onExit).padding(end = 14.dp))
            Text("${config.mode.emoji} ${config.mode.title}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }
        Spacer(Modifier.height(8.dp))
        if (config.mode == Mode.DUEL) PlayersBar(state) else Hud(config, state, elapsedMs, timeLeftMs)
        Spacer(Modifier.height(10.dp))

        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
            val gap = 8.dp
            val cols = config.difficulty.cols
            val rows = config.difficulty.rows
            val cellW = (maxWidth - gap * (cols - 1)) / cols
            val cellH = (maxHeight - gap * (rows - 1)) / rows
            val w = minOf(cellW, cellH * 0.75f)
            val h = w / 0.75f
            Column(Modifier.align(Alignment.Center), verticalArrangement = Arrangement.spacedBy(gap)) {
                repeat(rows) { r ->
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        repeat(cols) { c ->
                            val idx = r * cols + c
                            val card = state.cards[idx]
                            val pol = data.byId(card.politicianId)
                            val cs = state.states[idx]
                            FlipCard(
                                revealed = preview || cs != CardState.HIDDEN,
                                matched = cs == CardState.MATCHED,
                                modifier = Modifier.size(w, h),
                                onClick = { onCardClick(idx) },
                            ) {
                                CardFace(pol, card.face, data.photos[pol.id], showNameOnPhoto = config.pairType == PairType.PHOTO_PHOTO)
                            }
                        }
                    }
                }
            }
        }
    }

    if (status == Status.WON || status == Status.LOST) {
        ResultOverlay(config, state, status == Status.WON, finalScore, isRecord, elapsedMs, onRestart, onExit)
    }
}

@Composable
private fun Hud(config: GameConfig, s: GameState, elapsedMs: Long, timeLeftMs: Long) {
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat("Skóre", s.scores[0].toString())
            when (config.mode) {
                Mode.TIMED -> Stat("Čas", fmt(maxOf(0L, timeLeftMs)))
                Mode.MOVES -> Stat("Ťahy", "${s.moves}/${config.moveLimit}")
                else -> Stat("Čas", fmt(elapsedMs))
            }
            if (config.mode != Mode.MOVES) Stat("Ťahy", s.moves.toString())
            Stat("Séria", if (s.streak > 1) "🔥 ${s.streak}" else "–")
            Stat("Páry", "${s.pairsFound}/${s.pairs}")
        }
        if (config.mode == Mode.TIMED) {
            Spacer(Modifier.height(6.dp))
            val frac = (timeLeftMs.toFloat() / (config.timeLimitMs + 3000L * s.pairs)).coerceIn(0f, 1f)
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(C.Card)) {
                Box(Modifier.fillMaxWidth(frac).fillMaxHeight().background(if (frac < 0.25f) C.Red else C.Gold))
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        Text(label, color = C.TextDim, fontSize = 11.sp)
    }
}

@Composable
private fun PlayersBar(s: GameState) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (p in 0 until s.players) {
            val active = p == s.current
            val shape = RoundedCornerShape(12.dp)
            Column(
                Modifier
                    .weight(1f)
                    .clip(shape)
                    .background(C.Players[p].copy(alpha = if (active) 0.55f else 0.18f))
                    .border(2.dp, if (active) C.Gold else Color.Transparent, shape)
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Hráč ${p + 1}", color = Color.White, fontSize = 12.sp)
                Text(s.scores[p].toString(), color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun ResultOverlay(
    config: GameConfig, s: GameState, won: Boolean, score: Int, record: Boolean, elapsedMs: Long,
    onRestart: () -> Unit, onExit: () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.72f)).clickable(enabled = false) {}, contentAlignment = Alignment.Center) {
        if (won) Confetti()
        val shape = RoundedCornerShape(24.dp)
        Column(
            Modifier
                .padding(28.dp)
                .clip(shape)
                .background(C.Navy)
                .border(2.dp, if (won) C.Gold else C.Red, shape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (config.mode == Mode.DUEL) {
                val w = s.winners
                Text("🏆", fontSize = 48.sp)
                Text(
                    if (w.size == 1) "Víťaz: Hráč ${w[0] + 1}" else "Remíza!",
                    color = C.Gold, fontSize = 26.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                s.scores.forEachIndexed { i, sc -> Text("Hráč ${i + 1}: $sc", color = Color.White, fontSize = 16.sp) }
            } else if (won) {
                val stars = Engine.stars(s.moves, s.pairs)
                Text("⭐".repeat(stars) + "☆".repeat(3 - stars), fontSize = 38.sp)
                Text("Výborne!", color = C.Gold, fontSize = 28.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(8.dp))
                Text("Skóre: $score", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("Ťahy: ${s.moves} · Čas: ${fmt(elapsedMs)} · Séria: ${s.bestStreak}", color = C.TextDim, fontSize = 13.sp)
                if (record) Text("🎉 Nový rekord!", color = C.Green, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            } else {
                Text("😵", fontSize = 48.sp)
                Text(
                    if (config.mode == Mode.TIMED) "Čas vypršal" else "Došli ťahy",
                    color = C.Red, fontSize = 26.sp, fontWeight = FontWeight.Black,
                )
                Text("Našiel si ${s.pairsFound} z ${s.pairs} párov", color = Color.White, fontSize = 15.sp)
            }
            Spacer(Modifier.height(20.dp))
            PillButton("Hrať znova", Modifier.fillMaxWidth(), onClick = onRestart)
            Spacer(Modifier.height(10.dp))
            PillButton("Menu", Modifier.fillMaxWidth(), primary = false, onClick = onExit)
        }
    }
}

private fun fmt(ms: Long): String {
    val s = ms / 1000
    return "%d:%02d".format(s / 60, s % 60)
}
