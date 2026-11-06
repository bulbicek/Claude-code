package sk.pexeso.politici.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
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
import kotlinx.coroutines.delay
import sk.pexeso.politici.AppData
import sk.pexeso.politici.Politician
import sk.pexeso.politici.Store

private class Question(val answer: Politician, val options: List<Politician>)

private const val QUESTIONS = 10
private const val QUESTION_MS = 12_000L
private const val QUIZ_KEY = "QUIZ"

@Composable
fun QuizScreen(data: AppData, store: Store, onExit: () -> Unit) = Backdrop {
    val pool = data.withPhotos
    var round by remember { mutableIntStateOf(0) }
    val questions = remember(round) {
        pool.shuffled().take(QUESTIONS).map { a ->
            Question(a, (pool.filter { it.id != a.id }.shuffled().take(3) + a).shuffled())
        }
    }
    var idx by remember(round) { mutableIntStateOf(0) }
    var score by remember(round) { mutableIntStateOf(0) }
    var correct by remember(round) { mutableIntStateOf(0) }
    var streak by remember(round) { mutableIntStateOf(0) }
    var picked by remember(round) { mutableStateOf<String?>(null) } // id; "" = čas vypršal
    var timeLeft by remember(round) { mutableLongStateOf(QUESTION_MS) }
    var done by remember(round) { mutableStateOf(false) }
    var record by remember(round) { mutableStateOf(false) }

    LaunchedEffect(round, idx) {
        timeLeft = QUESTION_MS
        while (picked == null && timeLeft > 0) {
            delay(100)
            timeLeft -= 100
        }
        if (picked == null) {
            picked = ""
            streak = 0
        }
    }
    LaunchedEffect(round, idx, picked) {
        if (picked == null) return@LaunchedEffect
        delay(1300)
        if (idx + 1 < questions.size) {
            idx += 1
            picked = null
        } else {
            record = store.submit(QUIZ_KEY, score)
            done = true
        }
    }

    Column(Modifier.fillMaxSize().navigationBarsPadding().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("‹", color = Color.White, fontSize = 30.sp, modifier = Modifier.clickable(onClick = onExit).padding(end = 14.dp))
            Text("🧠 Spoznaj politika", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        }
        if (done) {
            Result(score, correct, questions.size, store.best(QUIZ_KEY), record, { round += 1 }, onExit)
            return@Column
        }
        val q = questions[idx]
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
            Text("Otázka ${idx + 1}/${questions.size}", color = C.TextDim, fontSize = 14.sp)
            Text(if (streak > 1) "🔥 $streak  " else "", color = C.Gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text("Skóre $score", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        val frac = (timeLeft.toFloat() / QUESTION_MS).coerceIn(0f, 1f)
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(C.Card)) {
            Box(Modifier.fillMaxWidth(frac).fillMaxHeight().background(if (frac < 0.3f) C.Red else C.Gold))
        }
        Spacer(Modifier.height(12.dp))

        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            PhotoFace(q.answer, data.photos[q.answer.id], showName = false, modifier = Modifier.fillMaxHeight().aspectRatio(0.8f, matchHeightConstraintsFirst = true))
        }
        Spacer(Modifier.height(12.dp))
        q.options.forEach { opt ->
            val p = picked
            val isAnswer = opt.id == q.answer.id
            val bg = when {
                p == null -> C.Card
                isAnswer -> C.Green.copy(alpha = 0.55f)
                opt.id == p -> C.Red.copy(alpha = 0.6f)
                else -> C.Card
            }
            val shape = RoundedCornerShape(14.dp)
            Box(
                Modifier
                    .padding(vertical = 4.dp)
                    .fillMaxWidth()
                    .clip(shape)
                    .background(bg)
                    .border(1.dp, Color.White.copy(alpha = 0.2f), shape)
                    .clickable(enabled = p == null) {
                        picked = opt.id
                        if (isAnswer) {
                            correct += 1
                            streak += 1
                            score += 100 + (timeLeft / 100).toInt() + 25 * (streak - 1)
                        } else streak = 0
                    }
                    .padding(vertical = 13.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(opt.name, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun Result(score: Int, correct: Int, total: Int, best: Int, record: Boolean, onAgain: () -> Unit, onExit: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (correct * 2 >= total) Confetti()
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            val verdict = when {
                correct == total -> "Perfektný znalec! 🏛️"
                correct >= 8 -> "Skvelé oko!"
                correct >= 5 -> "Celkom dobre"
                else -> "Treba sa viac sledovať správy 😄"
            }
            Text(verdict, color = C.Gold, fontSize = 26.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text("$correct / $total správne", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text("Skóre: $score · Rekord: $best", color = C.TextDim, fontSize = 15.sp)
            if (record) Text("🎉 Nový rekord!", color = C.Green, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(24.dp))
            PillButton("Hrať znova", Modifier.fillMaxWidth(), onClick = onAgain)
            Spacer(Modifier.height(10.dp))
            PillButton("Menu", Modifier.fillMaxWidth(), primary = false, onClick = onExit)
        }
    }
}
