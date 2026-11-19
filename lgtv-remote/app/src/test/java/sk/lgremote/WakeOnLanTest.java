package sk.lgremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.util.List;

import sk.lgremote.atv.WakeOnLan;

/** Overuje kuzelny paket, ktorym sa budi uspany box. */
public class WakeOnLanTest {

    private static final byte[] MAC = {
            (byte) 0x28, (byte) 0x6C, (byte) 0x07,
            (byte) 0xAA, (byte) 0xBB, (byte) 0xCC};

    @Test
    public void paketMaSpravnyTvar() {
        byte[] packet = WakeOnLan.magicPacket("28:6C:07:AA:BB:CC");
        assertEquals("paket ma mat 102 bajtov", 102, packet.length);
        for (int i = 0; i < 6; i++) {
            assertEquals("uvod ma byt sest bajtov 0xFF", (byte) 0xFF, packet[i]);
        }
        for (int blok = 0; blok < 16; blok++) {
            byte[] kus = new byte[6];
            System.arraycopy(packet, 6 + blok * 6, kus, 0, 6);
            assertArrayEquals("MAC sa ma zopakovat 16-krat, chyba v bloku " + blok,
                    MAC, kus);
        }
    }

    @Test
    public void macSaDaZadatVRoznychTvaroch() {
        assertArrayEquals(MAC, WakeOnLan.parseMac("28:6C:07:AA:BB:CC"));
        assertArrayEquals(MAC, WakeOnLan.parseMac("28-6c-07-aa-bb-cc"));
        assertArrayEquals(MAC, WakeOnLan.parseMac("286C07AABBCC"));
        assertArrayEquals(MAC, WakeOnLan.parseMac("  28:6c:07:AA:bb:cc  "));
    }

    @Test
    public void zlaMacSaOdmietne() {
        String[] zle = {null, "", "28:6C:07:AA:BB", "28:6C:07:AA:BB:CC:DD", "zzz"};
        for (String vstup : zle) {
            try {
                WakeOnLan.parseMac(vstup);
                fail("malo zlyhat na vstupe: " + vstup);
            } catch (IllegalArgumentException e) {
                assertTrue("chyba nema spravu", e.getMessage().length() > 0);
            }
        }
    }

    @Test
    public void paketIdeAjNaVysielaciuAdresuSiete() {
        List<String> ciele = WakeOnLan.targets("192.168.0.100");
        assertTrue("chyba celosietove vysielanie", ciele.contains("255.255.255.255"));
        assertTrue("chyba vysielanie do podsiete", ciele.contains("192.168.0.255"));
        assertTrue("chyba posledna znama adresa", ciele.contains("192.168.0.100"));
    }

    @Test
    public void bezZnamejAdresySaPosleAsponVysielanie() {
        List<String> ciele = WakeOnLan.targets(null);
        assertEquals(1, ciele.size());
        assertEquals("255.255.255.255", ciele.get(0));
    }
}
