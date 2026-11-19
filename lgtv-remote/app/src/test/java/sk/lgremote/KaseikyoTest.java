package sk.lgremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Overuje kodovanie Kaseikyo proti skutocnym datam.
 *
 * Casovania nizsie su prevzate z databazy Flipper-IRDB, zo suboru pre
 * seriu Panasonic SC-HTB. Ak nase kodovanie vyrobi presne ten isty vzor,
 * je spravne — vratane poradia bitov, kontrolneho suctu aj dlzok impulzov.
 */
public class KaseikyoTest {

    @Test
    public void powerSediSDatabazou() {
        int[] zDatabazy = {3456, 1728, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 1296, 432, 1296, 432, 1296, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 1296, 432, 1296, 432, 432, 432, 432, 432, 1296, 432};
        int[] nase = Kaseikyo.buildPattern(0xA0, 0x00, 0x3D);
        assertArrayEquals("POWER: vzor nesedi s overenymi datami", zDatabazy, nase);
    }

    @Test
    public void subwooferUpSediSDatabazou() {
        int[] zDatabazy = {3456, 1728, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 1296, 432, 1296, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432};
        int[] nase = Kaseikyo.buildPattern(0xA0, 0x14, 0xBC);
        assertArrayEquals("SUBWOOFER+: vzor nesedi s overenymi datami", zDatabazy, nase);
    }

    @Test
    public void volUpSediSDatabazou() {
        int[] zDatabazy = {3456, 1728, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432};
        int[] nase = Kaseikyo.buildPattern(0xA0, 0x00, 0x20);
        assertArrayEquals("VOL+: vzor nesedi s overenymi datami", zDatabazy, nase);
    }

    @Test
    public void upSediSDatabazou() {
        int[] zDatabazy = {3456, 1728, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 1296, 432, 1296, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 1296, 432, 1296, 432, 1296, 432, 1296, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432};
        int[] nase = Kaseikyo.buildPattern(0xA0, 0x1C, 0xFC);
        assertArrayEquals("UP: vzor nesedi s overenymi datami", zDatabazy, nase);
    }

    @Test
    public void muteSediSDatabazou() {
        int[] zDatabazy = {3456, 1728, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 1296, 432, 1296, 432, 432, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 1296, 432, 432, 432, 432, 432, 1296, 432};
        int[] nase = Kaseikyo.buildPattern(0xA0, 0x00, 0x32);
        assertArrayEquals("MUTE: vzor nesedi s overenymi datami", zDatabazy, nase);
    }

    @Test
    public void kontrolnySucetJeXor() {
        assertEquals(0x9D, Kaseikyo.checksum(0xA0, 0x00, 0x3D));
        assertEquals(0x04, Kaseikyo.checksum(0xA0, 0x14, 0xB0));
        assertEquals(0x40, Kaseikyo.checksum(0xA0, 0x1C, 0xFC));
    }

    @Test
    public void vzorMaSpravnyTvar() {
        int[] p = Kaseikyo.buildPattern(0xA0, 0x00, 0x3D);
        assertEquals("48 bitov plus uvod a zaver", 99, p.length);
        assertEquals(3456, p[0]);
        assertEquals(1728, p[1]);
        assertEquals(432, p[p.length - 1]);
        int spolu = 0;
        for (int v : p) {
            assertTrue("zaporne alebo nulove trvanie", v > 0);
            spolu += v;
        }
        assertTrue("ramec je prilis dlhy: " + spolu, spolu < 200000);
    }

    @Test
    public void vyrobcaJePanasonic() {
        // Prve dva bajty ramca musia byt 02 20; precitame ich spat zo vzoru.
        int[] p = Kaseikyo.buildPattern(0xA0, 0x00, 0x3D);
        int prvy = 0;
        int druhy = 0;
        for (int i = 0; i < 8; i++) {
            prvy |= (p[3 + i * 2] > 800 ? 1 : 0) << i;
            druhy |= (p[19 + i * 2] > 800 ? 1 : 0) << i;
        }
        assertEquals(0x02, prvy);
        assertEquals(0x20, druhy);
    }
}
