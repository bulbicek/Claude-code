package sk.lgremote.pages;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import sk.lgremote.IrSender;
import sk.lgremote.Kaseikyo;
import sk.lgremote.KaseikyoScannerActivity;
import sk.lgremote.Ui;

import static sk.lgremote.Ui.ACCENT;
import static sk.lgremote.Ui.DANGER;
import static sk.lgremote.Ui.MUTED;
import static sk.lgremote.Ui.SURFACE;
import static sk.lgremote.Ui.TEXT;
import static sk.lgremote.Ui.button;
import static sk.lgremote.Ui.dp;
import static sk.lgremote.Ui.row;
import static sk.lgremote.Ui.sectionLabel;

/**
 * Soundbar Panasonic SC-HTB100 — infracerveny, protokol Kaseikyo.
 *
 * Kody pochadzaju z databazy pre seriu SC-HTB a su overene: nase
 * kodovanie vyraba presne tie casovania, ktore su v nej ulozene.
 * Hlasitost a stlmenie potvrdzuje aj druha, nezavisla databaza.
 */
public class PanasonicPage implements RemotePage {

    /** Zariadenie A0 = zvukova technika Panasonic. */
    private static final int DEVICE = 0xA0;

    // Podskupiny, v ktorych tlacidla zijú
    private static final int S_MAIN = 0x00;
    private static final int S_SOUND = 0x14;
    private static final int S_MENU = 0x1C;

    private Activity activity;
    private IrSender ir;

    @Override
    public String title() {
        return "Soundbar Panasonic";
    }

    @Override
    public String subtitle() {
        return "SC-HTB100 · infračervené";
    }

    @Override
    public int background() {
        return Ui.BG_PURPLE;
    }

    @Override
    public View create(Activity a) {
        this.activity = a;
        this.ir = new IrSender(a);

        ScrollView scroll = new ScrollView(a);
        scroll.setBackgroundColor(background());
        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(a, 10), dp(a, 4), dp(a, 10), dp(a, 24));
        scroll.addView(root);

        if (!ir.hasEmitter()) {
            root.addView(Ui.note(a,
                    "Tento telefón nemá infračervený vysielač, "
                    + "takže tlačidlá neodošlú nič.", DANGER));
        }

        root.addView(sectionLabel(a, "Napájanie"));
        root.addView(row(a,
                key("⏻ 00", S_MAIN, 0x3D, false, DANGER, TEXT),
                key("⏻ 1C", S_MENU, 0x3D, false, DANGER, TEXT)));
        root.addView(row(a,
                key("Zap 00", S_MAIN, 0x3E, false, 0xFF15803D, TEXT),
                key("Zap 1C", S_MENU, 0x3E, false, 0xFF15803D, TEXT),
                key("Vyp 00", S_MAIN, 0x3F, false, 0xFF7F1D1D, TEXT),
                key("Vyp 1C", S_MENU, 0x3F, false, 0xFF7F1D1D, TEXT)));
        root.addView(Ui.note(a,
                "Napájanie má zatiaľ viac verzií, lebo databázy sa v ňom nezhodujú. "
                + "Skús ich po poradí a napíš mi, ktorá zabrala — ostatné potom "
                + "odstránim.", MUTED));

        root.addView(sectionLabel(a, "Hlasitosť"));
        root.addView(row(a,
                key("Hlas −", S_MAIN, 0x21, true),
                key("🔇", S_MAIN, 0x32, false, ACCENT, TEXT),
                key("Hlas +", S_MAIN, 0x20, true)));

        root.addView(sectionLabel(a, "Vstupy"));
        root.addView(row(a,
                key("Zdroj", S_MAIN, 0x86, false, ACCENT, TEXT),
                key("TV", S_MAIN, 0x9C, false),
                key("Line", S_MAIN, 0x9A, false),
                key("BD/DVD", S_MAIN, 0x9F, false)));

        root.addView(sectionLabel(a, "Zvuk"));
        root.addView(row(a,
                key("Režim zvuku", S_SOUND, 0xB0, false),
                key("Efekt", S_MENU, 0xB0, false)));
        root.addView(row(a,
                key("Dialóg −", S_SOUND, 0xEC, false),
                key("Dialóg +", S_SOUND, 0xEB, false)));
        root.addView(row(a,
                key("Basy −", S_SOUND, 0xBD, false),
                key("Basy +", S_SOUND, 0xBC, false)));

        root.addView(sectionLabel(a, "Menu"));
        root.addView(row(a,
                key("▲", S_MENU, 0xFC, false),
                key("OK", S_MENU, 0xFB, false, ACCENT, TEXT),
                key("▼", S_MENU, 0xFD, false)));
        root.addView(row(a, key("Nastavenie", S_MENU, 0xB5, false)));

        root.addView(Ui.note(a,
                "Bluetooth a tlačidlá prehrávania v databáze neboli — "
                + "ich kódy sa dajú nájsť skenerom nižšie.", MUTED));

        root.addView(sectionLabel(a, "Hľadanie ďalších tlačidiel"));
        root.addView(row(a, button(a, "Skener Kaseikyo", SURFACE, MUTED, false,
                () -> activity.startActivity(
                        new Intent(activity, KaseikyoScannerActivity.class)))));
        return scroll;
    }

    private Button key(String label, int subdevice, int function, boolean repeat) {
        return key(label, subdevice, function, repeat, SURFACE, TEXT);
    }

    private Button key(String label, final int subdevice, final int function,
                       boolean repeat, int fill, int textColor) {
        return button(activity, label, fill, textColor, repeat,
                () -> ir.sendPattern(Kaseikyo.CARRIER_HZ,
                        Kaseikyo.buildPattern(DEVICE, subdevice, function)));
    }
}
