package sk.lgremote;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import static sk.lgremote.Ui.ACCENT;
import static sk.lgremote.Ui.BG;
import static sk.lgremote.Ui.DANGER;
import static sk.lgremote.Ui.SURFACE;
import static sk.lgremote.Ui.TEXT;
import static sk.lgremote.Ui.button;
import static sk.lgremote.Ui.dp;
import static sk.lgremote.Ui.row;
import static sk.lgremote.Ui.sectionLabel;

/** Hlavna obrazovka ovladaca pre LG 42LW4500. */
public class MainActivity extends Activity {

    private IrSender ir;
    private LinearLayout root;
    private boolean numbersVisible = false;
    private LinearLayout numbersBlock;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ir = new IrSender(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(this, 10), dp(this, 14), dp(this, 10), dp(this, 24));
        scroll.addView(root);

        buildHeader();
        if (!ir.hasEmitter()) {
            root.addView(Ui.note(this,
                    "Tento telefón nemá infračervený vysielač, "
                    + "takže tlačidlá neodošlú nič. Skontroluj, či je to naozaj "
                    + "model s IR blasterom.", DANGER));
        }
        buildPower();
        buildInputs();
        buildNavigation();
        buildExtras();
        buildNumbers();
        buildColors();
        buildMedia();
        buildScannerLink();

        setContentView(scroll);
    }

    private void send(final int obc) {
        ir.sendObc(obc);
    }

    private Button key(String label, final int obc, boolean repeat) {
        return key(label, obc, repeat, SURFACE, TEXT);
    }

    private Button key(String label, final int obc, boolean repeat, int fill, int textColor) {
        return button(this, label, fill, textColor, repeat, new Ui.Press() {
            @Override public void fire() {
                send(obc);
            }
        });
    }

    private void buildHeader() {
        TextView title = new TextView(this);
        title.setText("LG 42LW4500");
        title.setTextColor(TEXT);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, dp(this, 2));
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Namier vrch telefónu na televízor");
        sub.setTextColor(Ui.MUTED);
        sub.setTextSize(13);
        sub.setGravity(Gravity.CENTER);
        root.addView(sub);
    }

    private void buildPower() {
        root.addView(sectionLabel(this, "Napájanie"));
        root.addView(row(this,
                key("Zapnúť", LgCodes.POWER_ON, false, 0xFF15803D, TEXT),
                key("⏻", LgCodes.POWER_TOGGLE, false, DANGER, TEXT),
                key("Vypnúť", LgCodes.POWER_OFF, false, 0xFF7F1D1D, TEXT)));
    }

    private void buildInputs() {
        root.addView(sectionLabel(this, "Vstupy"));
        root.addView(row(this,
                key("Zdroj", LgCodes.INPUT, false, ACCENT, TEXT),
                key("TV", LgCodes.INPUT_TV, false),
                key("AV", LgCodes.AV1, false)));
        root.addView(row(this,
                key("HDMI 1", LgCodes.HDMI1, false),
                key("HDMI 2", LgCodes.HDMI2, false),
                key("HDMI 3", LgCodes.HDMI3, false)));
    }

    private void buildNavigation() {
        root.addView(sectionLabel(this, "Ovládanie"));

        // Lavy stlpec: hlasitost, stred: smerovy kriz, pravy stlpec: kanaly
        LinearLayout block = new LinearLayout(this);
        block.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout volume = new LinearLayout(this);
        volume.setOrientation(LinearLayout.VERTICAL);
        volume.addView(key("Hlas +", LgCodes.VOL_UP, true), vlp());
        volume.addView(key("🔇", LgCodes.MUTE, false), vlp());
        volume.addView(key("Hlas −", LgCodes.VOL_DOWN, true), vlp());

        LinearLayout pad = new LinearLayout(this);
        pad.setOrientation(LinearLayout.VERTICAL);
        pad.addView(row(this, key("▲", LgCodes.UP, true)));
        pad.addView(row(this,
                key("◀", LgCodes.LEFT, true),
                key("OK", LgCodes.OK, false, ACCENT, TEXT),
                key("▶", LgCodes.RIGHT, true)));
        pad.addView(row(this, key("▼", LgCodes.DOWN, true)));

        LinearLayout channel = new LinearLayout(this);
        channel.setOrientation(LinearLayout.VERTICAL);
        channel.addView(key("Kanál +", LgCodes.CH_UP, true), vlp());
        channel.addView(key("Späť", LgCodes.Q_VIEW, false), vlp());
        channel.addView(key("Kanál −", LgCodes.CH_DOWN, true), vlp());

        block.addView(volume, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        block.addView(pad, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1.4f));
        block.addView(channel, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(block);
    }

    private LinearLayout.LayoutParams vlp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(this, 54));
        lp.setMargins(dp(this, 3), dp(this, 3), dp(this, 3), dp(this, 3));
        return lp;
    }

    private void buildExtras() {
        root.addView(sectionLabel(this, "Menu"));
        root.addView(row(this,
                key("Menu", LgCodes.MENU, false),
                key("Q.Menu", LgCodes.Q_MENU, false),
                key("Naspäť", LgCodes.BACK, false),
                key("Exit", LgCodes.EXIT, false)));
        root.addView(row(this,
                key("Info", LgCodes.INFO, false),
                key("Program", LgCodes.GUIDE, false),
                key("Pomer", LgCodes.RATIO, false),
                key("AV režim", LgCodes.AV_MODE, false)));
        root.addView(row(this,
                key("3D", LgCodes.THREE_D, false, 0xFF6D28D9, TEXT),
                key("Simplink", LgCodes.SIMPLINK, false),
                key("Teletext", LgCodes.TEXT, false),
                key("Časovač", LgCodes.SLEEP, false)));
    }

    private void buildNumbers() {
        final Button[] toggle = new Button[1];
        toggle[0] = button(this, "Číslice ▾", SURFACE, TEXT, false, new Ui.Press() {
            @Override public void fire() {
                numbersVisible = !numbersVisible;
                numbersBlock.setVisibility(numbersVisible ? View.VISIBLE : View.GONE);
                toggle[0].setText(numbersVisible ? "Číslice ▴" : "Číslice ▾");
            }
        });
        root.addView(sectionLabel(this, "Kanály priamo"));
        root.addView(row(this, toggle[0]));

        numbersBlock = new LinearLayout(this);
        numbersBlock.setOrientation(LinearLayout.VERTICAL);
        numbersBlock.setVisibility(View.GONE);
        numbersBlock.addView(row(this,
                key("1", LgCodes.digit(1), false),
                key("2", LgCodes.digit(2), false),
                key("3", LgCodes.digit(3), false)));
        numbersBlock.addView(row(this,
                key("4", LgCodes.digit(4), false),
                key("5", LgCodes.digit(5), false),
                key("6", LgCodes.digit(6), false)));
        numbersBlock.addView(row(this,
                key("7", LgCodes.digit(7), false),
                key("8", LgCodes.digit(8), false),
                key("9", LgCodes.digit(9), false)));
        numbersBlock.addView(row(this,
                key("Obľúbené", LgCodes.FAV, false),
                key("0", LgCodes.digit(0), false),
                key("Zoznam", LgCodes.Q_VIEW, false)));
        root.addView(numbersBlock);
    }

    private void buildColors() {
        root.addView(sectionLabel(this, "Farebné tlačidlá"));
        root.addView(row(this,
                key(" ", LgCodes.RED, false, 0xFFB91C1C, TEXT),
                key(" ", LgCodes.GREEN, false, 0xFF15803D, TEXT),
                key(" ", LgCodes.YELLOW, false, 0xFFCA8A04, TEXT),
                key(" ", LgCodes.BLUE, false, 0xFF1D4ED8, TEXT)));
    }

    private void buildMedia() {
        root.addView(sectionLabel(this, "Prehrávanie"));
        root.addView(row(this,
                key("⏮", LgCodes.PREV, false),
                key("▶", LgCodes.PLAY, false),
                key("⏸", LgCodes.PAUSE, false),
                key("⏹", LgCodes.STOP, false),
                key("⏭", LgCodes.NEXT, false)));
    }

    private void buildScannerLink() {
        root.addView(sectionLabel(this, "Ak niečo nefunguje"));
        root.addView(row(this, button(this, "Skener kódov", SURFACE, Ui.MUTED, false,
                new Ui.Press() {
                    @Override public void fire() {
                        startActivity(new Intent(MainActivity.this, ScannerActivity.class));
                    }
                })));
    }
}
