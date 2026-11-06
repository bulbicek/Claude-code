package sk.pexeso.politici.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import sk.pexeso.politici.Politician
import sk.pexeso.politici.engine.Face

private val CardShape = RoundedCornerShape(14.dp)

/** Karta s 3D otočením. Rub (otáznik) sa zobrazí do 90°, potom líc. */
@Composable
fun FlipCard(
    revealed: Boolean,
    matched: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    front: @Composable () -> Unit,
) {
    val rot by animateFloatAsState(if (revealed) 180f else 0f, tween(380), label = "flip")
    val scale by animateFloatAsState(if (matched) 0.93f else 1f, spring(Spring.DampingRatioMediumBouncy), label = "pop")
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .graphicsLayer {
                rotationY = rot
                cameraDistance = 14f * density
                scaleX = scale
                scaleY = scale
            }
            .clickable(enabled = !revealed, interactionSource = interaction, indication = null, onClick = onClick),
    ) {
        if (rot <= 90f) {
            CardBack()
        } else {
            Box(
                Modifier
                    .fillMaxSize()
                    .graphicsLayer { rotationY = 180f }
                    .then(if (matched) Modifier.border(3.dp, C.Green, CardShape) else Modifier),
            ) { front() }
        }
    }
}

@Composable
fun CardBack() {
    Box(
        Modifier
            .fillMaxSize()
            .clip(CardShape)
            .background(Brush.linearGradient(listOf(C.BlueLight, C.Blue, Color(0xFF082A5E))))
            .border(1.5.dp, Color.White.copy(alpha = 0.35f), CardShape),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val step = size.width / 5f
            var x = -size.height
            while (x < size.width) {
                drawLine(Color.White.copy(alpha = 0.07f), Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = 6f)
                x += step
            }
            drawCircle(Color.White.copy(alpha = 0.16f), radius = size.minDimension * 0.34f, center = center)
        }
        Text("?", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
    }
}

/** Líc karty: fotka (s menom/bez) alebo štítok s menom. */
@Composable
fun CardFace(politician: Politician, face: Face, photo: ImageBitmap?, showNameOnPhoto: Boolean) {
    when (face) {
        Face.PHOTO -> PhotoFace(politician, photo, showNameOnPhoto)
        Face.NAME -> Box(
            Modifier
                .fillMaxSize()
                .clip(CardShape)
                .background(Brush.linearGradient(listOf(Color(0xFFFFF4D6), Color(0xFFFFD580))))
                .border(1.5.dp, C.Gold, CardShape)
                .padding(6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                politician.name.replace(' ', '\n'),
                color = Color(0xFF1B2A49),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
                lineHeight = 17.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun PhotoFace(politician: Politician, photo: ImageBitmap?, showName: Boolean, modifier: Modifier = Modifier.fillMaxSize()) {
    Box(modifier.clip(CardShape).border(1.5.dp, Color.White.copy(alpha = 0.6f), CardShape)) {
        if (photo != null) {
            Image(photo, politician.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
        } else {
            Avatar(politician.name, Modifier.fillMaxSize())
        }
        if (showName) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.78f))))
                    .padding(top = 14.dp, bottom = 4.dp, start = 3.dp, end = 3.dp),
            ) {
                Text(
                    politician.surname,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Náhradný portrét (siluetka + iniciály), keď fotka nie je v aplikácii. */
@Composable
fun Avatar(name: String, modifier: Modifier = Modifier) {
    val hue = (name.hashCode().toLong().let { if (it < 0) -it else it } % 360).toFloat()
    val top = Color.hsv(hue, 0.55f, 0.85f)
    val bottom = Color.hsv((hue + 40f) % 360f, 0.7f, 0.45f)
    val initials = name.split(' ').filter { it.isNotEmpty() }.joinToString("") { it.take(1) }.take(2)
    Box(modifier.background(Brush.verticalGradient(listOf(top, bottom))), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            drawCircle(Color.White.copy(alpha = 0.28f), radius = w * 0.22f, center = Offset(w / 2, h * 0.36f))
            drawCircle(Color.White.copy(alpha = 0.28f), radius = w * 0.42f, center = Offset(w / 2, h * 0.98f))
        }
        Text(initials, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
    }
}
