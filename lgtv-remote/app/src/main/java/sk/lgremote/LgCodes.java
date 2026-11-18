package sk.lgremote;

/**
 * IR kody pre LG televizory.
 *
 * Protokol: NEC1, device 4 -> 32-bitovy ramec ma vzdy prefix 0x20DF.
 * Tu drzime len OBC (original button code); plny hex sa dopocita v IrSender.
 *
 * Zdroj kodov: irdb (probonopd/irdb, codes/LG/TV/4,-1.csv).
 * Overene prepocty: POWER obc 8 -> 0x20DF10EF, VOL+ obc 2 -> 0x20DF40BF.
 */
public final class LgCodes {

    private LgCodes() {}

    // Napajanie
    public static final int POWER_TOGGLE = 8;
    public static final int POWER_ON     = 196;  // diskretne zapnutie
    public static final int POWER_OFF    = 197;  // diskretne vypnutie

    // Hlasitost a kanaly
    public static final int VOL_UP   = 2;
    public static final int VOL_DOWN = 3;
    public static final int MUTE     = 9;
    public static final int CH_UP    = 0;
    public static final int CH_DOWN  = 1;

    // Kurzor a potvrdenie
    public static final int UP    = 64;
    public static final int DOWN  = 65;
    public static final int LEFT  = 7;
    public static final int RIGHT = 6;
    public static final int OK    = 68;

    // Menu a navigacia
    public static final int MENU    = 67;   // Home / hlavne menu
    public static final int Q_MENU  = 69;   // rychle menu
    public static final int BACK    = 40;   // Return
    public static final int EXIT    = 91;
    public static final int INFO    = 170;
    public static final int GUIDE   = 169;

    // Vstupy
    public static final int INPUT     = 11;  // prepinanie TV/AV
    public static final int INPUT_TV  = 15;
    public static final int HDMI1     = 206;
    public static final int HDMI2     = 204;
    public static final int HDMI3     = 233;
    public static final int HDMI4     = 218;
    public static final int AV1       = 90;
    public static final int COMPONENT = 191;

    // Obraz a zvuk
    public static final int RATIO    = 121;  // pomer stran
    public static final int AV_MODE  = 48;
    public static final int THREE_D  = 220;  // 3D -> 0x20DF3BC4 (neoverene na LW4500)
    public static final int SIMPLINK = 126;
    public static final int SLEEP    = 14;

    // Cislice: 0 = obc 16, 1 = 17, ... 9 = 25
    public static int digit(int d) {
        return 16 + d;
    }

    public static final int FAV    = 30;
    public static final int Q_VIEW = 26;  // predchadzajuci kanal
    public static final int TEXT   = 32;

    // Farebne tlacidla (teletext)
    public static final int RED    = 114;
    public static final int GREEN  = 113;
    public static final int YELLOW = 99;
    public static final int BLUE   = 97;

    // Prehravanie
    public static final int PLAY  = 176;
    public static final int PAUSE = 186;
    public static final int STOP  = 177;
    public static final int PREV  = 143;
    public static final int NEXT  = 142;
}
