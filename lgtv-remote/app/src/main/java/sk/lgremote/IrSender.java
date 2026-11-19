package sk.lgremote;

import android.content.Context;
import android.hardware.ConsumerIrManager;

/**
 * Posiela NEC ramce cez IR vysielac telefonu.
 *
 * NEC casovanie (mikrosekundy, nosna 38 kHz):
 *   uvod   9000 zapnute + 4500 vypnute
 *   bit 0   560 zapnute +  560 vypnute
 *   bit 1   560 zapnute + 1690 vypnute
 *   zaver   560 zapnute
 * Bity sa vysielaju od najvyssieho (bit 31) po najnizsi.
 */
public class IrSender {

    private static final int CARRIER_HZ = 38000;
    private static final int LG_PREFIX  = 0x20DF;

    private final ConsumerIrManager irManager;
    private final boolean hasEmitter;

    public IrSender(Context context) {
        ConsumerIrManager m =
                (ConsumerIrManager) context.getSystemService(Context.CONSUMER_IR_SERVICE);
        this.irManager = m;
        this.hasEmitter = m != null && m.hasIrEmitter();
    }

    public boolean hasEmitter() {
        return hasEmitter;
    }

    /** Otoci poradie bitov v bajte (NEC posiela LSB ako prvy). */
    private static int reverseByte(int b) {
        int r = 0;
        for (int i = 0; i < 8; i++) {
            r = (r << 1) | ((b >> i) & 1);
        }
        return r & 0xFF;
    }

    /** OBC (cislo tlacidla) -> uplny 32-bitovy NEC ramec pre LG. */
    public static long frameForObc(int obc) {
        int cmd = reverseByte(obc & 0xFF);
        int inv = (~cmd) & 0xFF;
        return ((long) LG_PREFIX << 16) | ((long) cmd << 8) | inv;
    }

    /** Vytvori casovaciu postupnost pre jeden NEC ramec. */
    public static int[] buildPattern(long frame) {
        int[] pattern = new int[2 + 64 + 1];
        int i = 0;
        pattern[i++] = 9000;
        pattern[i++] = 4500;
        for (int bit = 31; bit >= 0; bit--) {
            pattern[i++] = 560;
            pattern[i++] = ((frame >> bit) & 1L) == 1L ? 1690 : 560;
        }
        pattern[i] = 560;
        return pattern;
    }

    /** Posle tlacidlo podla jeho OBC. */
    public boolean sendObc(int obc) {
        return sendFrame(frameForObc(obc));
    }

    /** Posle hotovy casovaci vzor na danej nosnej (napr. Kaseikyo na 37 kHz). */
    public boolean sendPattern(int carrierHz, int[] pattern) {
        if (!hasEmitter) {
            return false;
        }
        try {
            irManager.transmit(carrierHz, pattern);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Posle lubovolny 32-bitovy ramec (pre skener a vlastne kody). */
    public boolean sendFrame(long frame) {
        if (!hasEmitter) {
            return false;
        }
        try {
            irManager.transmit(CARRIER_HZ, buildPattern(frame));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
