import sk.pexeso.politici.engine.*
import kotlin.random.Random
import kotlin.test.*

class EngineTest {
    private val ids = (1..20).map { "p$it" }

    @Test fun dealPhotoPhoto() {
        val c = Engine.deal(ids, 8, PairType.PHOTO_PHOTO, Random(1))
        assertEquals(16, c.size)
        assertEquals(8, c.map { it.pairKey }.toSet().size)
        c.groupBy { it.pairKey }.values.forEach { g -> assertEquals(2, g.size); assertEquals(g[0].politicianId, g[1].politicianId); assertTrue(g.all { it.face == Face.PHOTO }) }
    }
    @Test fun dealPhotoName() {
        val c = Engine.deal(ids, 6, PairType.PHOTO_NAME, Random(2))
        c.groupBy { it.pairKey }.values.forEach { g -> assertEquals(setOf(Face.PHOTO, Face.NAME), g.map { it.face }.toSet()) }
        assertEquals(c.indices.toList(), c.map { it.index })
    }
    @Test fun fullGameSolve() {
        val c = Engine.deal(ids, 6, PairType.PHOTO_PHOTO, Random(3))
        var s = Engine.newGame(c)
        for (g in c.groupBy { it.pairKey }.values) {
            s = Engine.flip(s, g[0].index); assertFalse(s.awaitingResolve)
            s = Engine.flip(s, g[1].index); assertTrue(s.awaitingResolve); assertTrue(s.pendingMatch)
            s = Engine.resolve(s)
        }
        assertTrue(s.finished); assertEquals(6, s.moves); assertEquals(6, s.bestStreak)
        assertEquals(100 * 6 + 50 * (0 + 1 + 2 + 3 + 4 + 5), s.scores[0])
        assertEquals(3, Engine.stars(s.moves, s.pairs))
    }
    @Test fun mismatchHidesAndSwitchesPlayer() {
        val c = Engine.deal(ids, 4, PairType.PHOTO_PHOTO, Random(4))
        val a = c[0]; val b = c.first { it.pairKey != a.pairKey }
        var s = Engine.newGame(c, players = 3)
        s = Engine.flip(s, a.index); s = Engine.flip(s, b.index)
        assertFalse(s.pendingMatch)
        assertSame(s, Engine.flip(s, c.first { it.index != a.index && it.index != b.index }.index)) // blokované
        s = Engine.resolve(s)
        assertEquals(1, s.current); assertEquals(0, s.streak)
        assertTrue(s.states.all { it == CardState.HIDDEN })
    }
    @Test fun matchKeepsPlayer() {
        val c = Engine.deal(ids, 4, PairType.PHOTO_PHOTO, Random(5))
        val g = c.groupBy { it.pairKey }.values.first()
        var s = Engine.newGame(c, 2)
        s = Engine.resolve(Engine.flip(Engine.flip(s, g[0].index), g[1].index))
        assertEquals(0, s.current); assertEquals(listOf(100, 0), s.scores); assertEquals(listOf(0), s.winners)
    }
    @Test fun invalidFlips() {
        val c = Engine.deal(ids, 4, PairType.PHOTO_PHOTO, Random(6))
        var s = Engine.newGame(c)
        s = Engine.flip(s, 0)
        assertSame(s, Engine.flip(s, 0)); assertSame(s, Engine.flip(s, 99)); assertSame(s, Engine.flip(s, -1))
    }
    @Test fun difficultyPairsFit() { Difficulty.values().forEach { assertTrue(it.pairs <= 20); assertEquals(0, it.cols * it.rows % 2) } }
}
