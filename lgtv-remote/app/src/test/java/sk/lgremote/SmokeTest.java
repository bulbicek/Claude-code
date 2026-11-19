package sk.lgremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.view.View;

import sk.lgremote.pages.LgPage;
import sk.lgremote.pages.MiBoxPage;
import sk.lgremote.pages.RemotePage;
import sk.lgremote.pages.SoonPage;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** Overuje, ze sa obrazovky vytvoria bez padu a ze kodovanie NEC je spravne. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class SmokeTest {

    @Test
    public void hlavnaObrazovkaSaVytvori() {
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        assertNotNull(a);
        assertTrue("okno obrazovky chyba", a.getWindow().getDecorView().getHeight() >= 0);
    }

    @Test
    public void skenerSaVytvori() {
        Activity a = Robolectric.buildActivity(ScannerActivity.class).setup().get();
        assertNotNull(a);
    }

    @Test
    public void vsetkyStrankySaVytvoria() {
        Activity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        RemotePage[] pages = {new LgPage(), new MiBoxPage(), new SoonPage(3), new SoonPage(4)};
        for (RemotePage page : pages) {
            assertNotNull("stranka nema nazov", page.title());
            assertNotNull("stranka nema popis", page.subtitle());
            View v = page.create(a);
            assertNotNull("stranka " + page.title() + " sa nevytvorila", v);
            page.release();
        }
    }

    @Test
    public void kodySediaSoZnamymiHodnotami() {
        assertEquals(0x20DF10EFL, IrSender.frameForObc(LgCodes.POWER_TOGGLE));
        assertEquals(0x20DF40BFL, IrSender.frameForObc(LgCodes.VOL_UP));
        assertEquals(0x20DFC03FL, IrSender.frameForObc(LgCodes.VOL_DOWN));
        assertEquals(0x20DF906FL, IrSender.frameForObc(LgCodes.MUTE));
        assertEquals(0x20DF00FFL, IrSender.frameForObc(LgCodes.CH_UP));
        assertEquals(0x20DF807FL, IrSender.frameForObc(LgCodes.CH_DOWN));
        assertEquals(0x20DFD02FL, IrSender.frameForObc(LgCodes.INPUT));
        assertEquals(0x20DF3BC4L, IrSender.frameForObc(LgCodes.THREE_D));
    }

    @Test
    public void kazdyRamecJePlatnyNec() {
        for (int obc = 0; obc < 256; obc++) {
            long f = IrSender.frameForObc(obc);
            int cmd = (int) ((f >> 8) & 0xFF);
            int inv = (int) (f & 0xFF);
            assertEquals("ramec pre " + obc + " nie je platny NEC", 0xFF, cmd ^ inv);
        }
    }

    @Test
    public void vzorMaSpravnyTvar() {
        int[] p = IrSender.buildPattern(IrSender.frameForObc(LgCodes.POWER_TOGGLE));
        assertEquals(67, p.length);
        assertEquals(9000, p[0]);
        assertEquals(4500, p[1]);
        assertEquals(560, p[p.length - 1]);
        int total = 0;
        for (int v : p) {
            total += v;
            assertTrue("zaporne alebo nulove trvanie", v > 0);
        }
        assertTrue("ramec je prilis dlhy: " + total, total < 100000);
    }
}
