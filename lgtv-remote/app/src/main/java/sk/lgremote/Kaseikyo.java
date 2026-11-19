package sk.lgremote;

/**
 * Kodovanie Kaseikyo — protokol, ktory pouziva Panasonic.
 *
 * Na rozdiel od NEC ma 48 bitov a nosnu 37 kHz. Ramec je sest bajtov,
 * kazdy sa vysiela najnizsim bitom napred:
 *
 *   02 20   vyrobca (Panasonic, 0x2002)
 *   D       zariadenie (A0 = zvukove zariadenie)
 *   S       podskupina
 *   F       tlacidlo
 *   D^S^F   kontrolny sucet
 *
 * Casovanie (mikrosekundy):
 *   uvod   3456 zapnute + 1728 vypnute
 *   bit 0   432 zapnute +  432 vypnute
 *   bit 1   432 zapnute + 1296 vypnute
 *   zaver   432 zapnute
 */
public final class Kaseikyo {

    public static final int CARRIER_HZ = 37000;

    private static final int VENDOR_LOW = 0x02;   // 0x2002 = Panasonic
    private static final int VENDOR_HIGH = 0x20;

    private static final int UNIT = 432;
    private static final int LEAD_ON = UNIT * 8;    // 3456
    private static final int LEAD_OFF = UNIT * 4;   // 1728
    private static final int ONE_OFF = UNIT * 3;    // 1296

    private Kaseikyo() {}

    /** Kontrolny sucet, ktory zariadenie overuje. */
    public static int checksum(int device, int subdevice, int function) {
        return (device ^ subdevice ^ function) & 0xFF;
    }

    /** Casovaci vzor pre jedno stlacenie. */
    public static int[] buildPattern(int device, int subdevice, int function) {
        int[] bytes = {
                VENDOR_LOW, VENDOR_HIGH,
                device & 0xFF, subdevice & 0xFF, function & 0xFF,
                checksum(device, subdevice, function)};

        int[] pattern = new int[2 + 48 * 2 + 1];
        int i = 0;
        pattern[i++] = LEAD_ON;
        pattern[i++] = LEAD_OFF;
        for (int b : bytes) {
            for (int bit = 0; bit < 8; bit++) {   // najnizsi bit ide prvy
                pattern[i++] = UNIT;
                pattern[i++] = ((b >> bit) & 1) == 1 ? ONE_OFF : UNIT;
            }
        }
        pattern[i] = UNIT;
        return pattern;
    }
}
