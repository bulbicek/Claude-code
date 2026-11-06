package sk.pexeso.politici.engine

import kotlin.random.Random

enum class Face { PHOTO, NAME }

enum class CardState { HIDDEN, REVEALED, MATCHED }

/** Ako sa tvoria páry: dve rovnaké fotky, alebo fotka + meno. */
enum class PairType(val label: String) {
    PHOTO_PHOTO("Fotka – fotka"),
    PHOTO_NAME("Fotka – meno"),
}

enum class Mode(val title: String, val subtitle: String, val emoji: String) {
    CLASSIC("Klasik", "Bez limitu, len ty a pamäť", "🃏"),
    TIMED("Na čas", "Preteky s časom, zhoda dá bonus", "⏱️"),
    MOVES("Na ťahy", "Obmedzený počet pokusov", "🎯"),
    DUEL("Duel", "2–4 hráči na jednom telefóne", "⚔️"),
}

enum class Difficulty(val label: String, val cols: Int, val rows: Int) {
    EASY("Ľahké", 3, 4),
    MEDIUM("Stredné", 4, 4),
    HARD("Ťažké", 4, 5),
    EXPERT("Expert", 5, 6);

    val pairs: Int get() = cols * rows / 2
}

data class GameConfig(
    val mode: Mode,
    val difficulty: Difficulty,
    val pairType: PairType,
    val players: Int = 1,
) {
    val key: String get() = "${mode.name}_${difficulty.name}_${pairType.name}"

    /** Limit ťahov pre režim „Na ťahy“. */
    val moveLimit: Int get() = difficulty.pairs * 2 + 2

    /** Počiatočný čas v ms pre režim „Na čas“. */
    val timeLimitMs: Long get() = difficulty.pairs * 9_000L + 10_000L
}

data class Card(val index: Int, val pairKey: Int, val politicianId: String, val face: Face)

data class GameState(
    val cards: List<Card>,
    val states: List<CardState>,
    val first: Int? = null,
    val second: Int? = null,
    val moves: Int = 0,
    val streak: Int = 0,
    val bestStreak: Int = 0,
    val players: Int = 1,
    val current: Int = 0,
    val scores: List<Int> = List(players) { 0 },
    val pairsFound: Int = 0,
) {
    val pairs: Int get() = cards.size / 2
    val finished: Boolean get() = pairsFound == pairs

    /** Dve karty sú otočené a čaká sa na vyhodnotenie. */
    val awaitingResolve: Boolean get() = first != null && second != null

    val pendingMatch: Boolean
        get() {
            val a = first ?: return false
            val b = second ?: return false
            return cards[a].pairKey == cards[b].pairKey
        }

    val winners: List<Int>
        get() {
            val top = scores.maxOrNull() ?: return emptyList()
            return scores.indices.filter { scores[it] == top }
        }
}

object Engine {
    const val MATCH_POINTS = 100
    const val STREAK_BONUS = 50

    fun deal(ids: List<String>, pairs: Int, type: PairType, rnd: Random = Random.Default): List<Card> {
        require(ids.size >= pairs) { "Málo politikov: ${ids.size} < $pairs" }
        val chosen = ids.shuffled(rnd).take(pairs)
        val raw = mutableListOf<Triple<Int, String, Face>>()
        chosen.forEachIndexed { key, id ->
            raw += Triple(key, id, Face.PHOTO)
            raw += Triple(key, id, if (type == PairType.PHOTO_NAME) Face.NAME else Face.PHOTO)
        }
        return raw.shuffled(rnd).mapIndexed { i, (key, id, face) -> Card(i, key, id, face) }
    }

    fun newGame(cards: List<Card>, players: Int = 1): GameState =
        GameState(cards, List(cards.size) { CardState.HIDDEN }, players = players)

    /** Otočí kartu [i]. Neplatné ťahy ignoruje a vráti nezmenený stav. */
    fun flip(s: GameState, i: Int): GameState {
        if (s.finished || s.awaitingResolve) return s
        if (i !in s.cards.indices || s.states[i] != CardState.HIDDEN) return s
        val st = s.states.toMutableList().also { it[i] = CardState.REVEALED }
        return if (s.first == null) {
            s.copy(states = st, first = i)
        } else {
            s.copy(states = st, second = i, moves = s.moves + 1)
        }
    }

    /** Vyhodnotí dvojicu otočených kariet: zhoda ostane odkrytá, inak sa skryjú. */
    fun resolve(s: GameState): GameState {
        val a = s.first ?: return s
        val b = s.second ?: return s
        val st = s.states.toMutableList()
        return if (s.pendingMatch) {
            st[a] = CardState.MATCHED
            st[b] = CardState.MATCHED
            val streak = s.streak + 1
            val scores = s.scores.toMutableList()
            scores[s.current] += MATCH_POINTS + STREAK_BONUS * (streak - 1)
            s.copy(
                states = st, first = null, second = null,
                streak = streak, bestStreak = maxOf(s.bestStreak, streak),
                scores = scores, pairsFound = s.pairsFound + 1,
            )
        } else {
            st[a] = CardState.HIDDEN
            st[b] = CardState.HIDDEN
            s.copy(
                states = st, first = null, second = null, streak = 0,
                current = if (s.players > 1) (s.current + 1) % s.players else s.current,
            )
        }
    }

    /** 3 hviezdy za hru blízku ideálu, 1 za dokončenie. */
    fun stars(moves: Int, pairs: Int): Int = when {
        moves <= pairs * 3 / 2 -> 3
        moves <= pairs * 11 / 5 -> 2
        else -> 1
    }
}
