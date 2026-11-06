package sk.pexeso.politici

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import org.json.JSONArray
import org.json.JSONObject

data class Politician(val id: String, val name: String) {
    val surname: String get() = name.substringAfterLast(' ')
}

data class Credit(
    val politicianName: String,
    val author: String,
    val license: String,
    val source: String,
)

class AppData(
    val politicians: List<Politician>,
    val photos: Map<String, ImageBitmap>,
    val credits: List<Credit>,
) {
    private val byId = politicians.associateBy { it.id }
    fun byId(id: String): Politician = byId.getValue(id)
    val withPhotos: List<Politician> get() = politicians.filter { it.id in photos }

    companion object {
        private const val DIR = "politicians"

        /** Načíta zoznam politikov, fotky (ak ich fetch_photos.py stiahol) a ich licencie. */
        fun load(ctx: Context): AppData {
            val am = ctx.assets
            val roster = JSONArray(am.open("$DIR/roster.json").bufferedReader().use { it.readText() })
            val politicians = (0 until roster.length()).map {
                val o = roster.getJSONObject(it)
                Politician(o.getString("id"), o.getString("name"))
            }
            val files = am.list(DIR)?.toSet().orEmpty()
            val photos = HashMap<String, ImageBitmap>()
            for (p in politicians) {
                val f = "${p.id}.jpg"
                if (f !in files) continue
                runCatching {
                    am.open("$DIR/$f").use { BitmapFactory.decodeStream(it) }
                }.getOrNull()?.let { photos[p.id] = it.asImageBitmap() }
            }
            val credits = if ("credits.json" in files) {
                runCatching {
                    val o = JSONObject(am.open("$DIR/credits.json").bufferedReader().use { it.readText() })
                    politicians.mapNotNull { p ->
                        o.optJSONObject(p.id)?.let {
                            Credit(p.name, it.optString("author"), it.optString("license"), it.optString("source"))
                        }
                    }
                }.getOrDefault(emptyList())
            } else emptyList()
            return AppData(politicians, photos, credits)
        }
    }
}

/** Najlepšie skóre a štatistiky v SharedPreferences. */
class Store(ctx: Context) {
    private val sp = ctx.getSharedPreferences("politpexeso", Context.MODE_PRIVATE)

    fun best(key: String): Int = sp.getInt("best_$key", 0)

    /** Vráti true, ak ide o nový rekord. */
    fun submit(key: String, score: Int): Boolean {
        val isRecord = score > best(key)
        sp.edit().putInt("games", games() + 1).apply {
            if (isRecord) putInt("best_$key", score)
        }.apply()
        return isRecord
    }

    fun games(): Int = sp.getInt("games", 0)
}
