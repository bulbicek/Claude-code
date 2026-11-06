package sk.pexeso.politici.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin
import kotlin.random.Random

object C {
    val Navy = Color(0xFF0B1B3A)
    val Blue = Color(0xFF0B4EA2)
    val BlueLight = Color(0xFF3B82F6)
    val Red = Color(0xFFEE1C25)
    val Gold = Color(0xFFFFC83D)
    val Green = Color(0xFF2ECC71)
    val Card = Color(0x1AFFFFFF)
    val TextDim = Color(0xB3FFFFFF)
    val Players = listOf(Color(0xFF3B82F6), Color(0xFFEE1C25), Color(0xFF2ECC71), Color(0xFFFFC83D))
}

@Composable
fun PolitTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = C.BlueLight, background = C.Navy, surface = C.Navy)) {
        content()
    }
}

/** Tmavý gradient na pozadí všetkých obrazoviek. */
@Composable
fun Backdrop(content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF14336E), C.Navy, Color(0xFF1B0F3B))))
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(C.Red.copy(alpha = 0.10f), radius = size.width * 0.6f, center = Offset(size.width * 1.0f, size.height * 0.08f))
            drawCircle(C.BlueLight.copy(alpha = 0.12f), radius = size.width * 0.7f, center = Offset(0f, size.height * 0.95f))
        }
        Box(Modifier.fillMaxSize().statusBarsPadding()) { content() }
    }
}

@Composable
fun PillButton(
    text: String,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(50)
    val bg = if (primary) Brush.horizontalGradient(listOf(C.Red, Color(0xFFFF5A3C))) else Brush.horizontalGradient(listOf(C.Card, C.Card))
    Box(
        modifier
            .clip(shape)
            .background(bg)
            .border(1.dp, Color.White.copy(alpha = if (primary) 0.0f else 0.25f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier
            .clip(shape)
            .background(if (selected) C.Blue else C.Card)
            .border(1.5.dp, if (selected) C.Gold else Color.White.copy(alpha = 0.15f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = Color.White, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal, fontSize = 15.sp)
    }
}

/** Padajúce konfety na výherných obrazovkách. */
@Composable
fun Confetti(modifier: Modifier = Modifier.fillMaxSize()) {
    class P(val x: Float, val y0: Float, val v: Float, val w: Float, val h: Float, val rot: Float, val spin: Float, val color: Color, val sway: Float)

    val palette = listOf(C.Red, C.Gold, C.BlueLight, C.Green, Color.White)
    val parts = remember {
        val r = Random(7)
        List(90) {
            P(r.nextFloat(), r.nextFloat(), 0.12f + r.nextFloat() * 0.25f, 8f + r.nextFloat() * 8f, 5f + r.nextFloat() * 6f,
                r.nextFloat() * 360f, 90f + r.nextFloat() * 240f, palette[r.nextInt(palette.size)], r.nextFloat() * 6f)
        }
    }
    var t by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = androidx.compose.runtime.withFrameNanos { it }
        while (true) androidx.compose.runtime.withFrameNanos { t = (it - start) / 1_000_000_000f }
    }
    Canvas(modifier) {
        parts.forEach { p ->
            val y = (((p.y0 + p.v * t) % 1.2f) - 0.1f) * size.height
            val x = p.x * size.width + sin(t * 2f + p.sway) * 18f
            rotate(p.rot + p.spin * t, pivot = Offset(x, y)) {
                drawRect(p.color, topLeft = Offset(x, y), size = Size(p.w, p.h))
            }
        }
    }
}
