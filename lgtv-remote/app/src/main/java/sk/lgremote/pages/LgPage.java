package sk.lgremote.pages;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import sk.lgremote.IrSender;
import sk.lgremote.LgCodes;
import sk.lgremote.ScannerActivity;
import sk.lgremote.Ui;

import static sk.lgremote.Ui.ACCENT;
import static sk.lgremote.Ui.DANGER;
import static sk.lgremote.Ui.SURFACE;
import static sk.lgremote.Ui.TEXT;
import static sk.lgremote.Ui.button;
import static sk.lgremote.Ui.dp;
import static sk.lgremote.Ui.row;
import static sk.lgremote.Ui.sectionLabel;

/** Televizor LG 42LW4500 — ovladany infracervenym vysielacom telefonu. */
public class LgPage implements RemotePage {

    private Activity activity;
    private IrSender ir;
    private LinearLayout root;
    private boolean numbersVisible = false;
    private LinearLayout numbersBlock;

    @Override
    public String title() {
        return "Televízor LG";
    }

    @Override
    public String subtitle() {
        return "42LW4500 · infračervené";
    }

    @Override
    public View create(Activity a) {
        this.activity = a;
        this.ir = new IrSender(a);

        ScrollView scroll = new ScrollView(a);
        root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(a, 10), dp(a, 4), dp(a, 10), dp(a, 24));
        scroll.addView(root);

        if (!ir.hasEmitter()) {
            root.addView(Ui.note(a,
                    "Tento telefón nemá infračervený vysielač, "
                    + "takže tlačidlá neodošlú nič.", DANGER));
        }
        buildPower();
        buildInputs();
        buildNavigation();
        buildExtras();
        buildNumbers();
        buildColors();
        buildMedia();
        buildScannerLink();
        return scroll;
    }

    private void send(final int obc) {
        ir.sendObc(obc);
    }

    private Button key(String label, final int obc, boolean repeat) {
        return key(label, obc, repeat, SURFACE, TEXT);
    }

    private Button key(String label, final int obc, boolean repeat, int fill, int textColor) {
        return button(activity, label, fill, textColor, repeat, new Ui.Press() {
            @Override public void fire() {
                send(obc);
            }
        });
    }

    private void buildPower() {
        root.addView(sectionLabel(activity, "Napájanie"));
        root.addView(row(activity,
                key("Zapnúť", LgCodes.POWER_ON, false, 0xFF15803D, TEXT),
                key("⏻", LgCodes.POWER_TOGGLE, false, DANGER, TEXT),
                key("Vypnúť", LgCodes.POWER_OFF, false, 0xFF7F1D1D, TEXT)));
    }

    private void buildInputs() {
        root.addView(sectionLabel(activity, "Vstupy"));
        root.addView(row(activity,
                key("Zdroj", LgCodes.INPUT, false, ACCENT, TEXT),
                key("TV", LgCodes.INPUT_TV, false),
                key("AV", LgCodes.AV1, false)));
        root.addView(row(activity,
                key("HDMI 1", LgCodes.HDMI1, false),
                key("HDMI 2", LgCodes.HDMI2, false),
                key("HDMI 3", LgCodes.HDMI3, false)));
    }

    private void buildNavigation() {
        root.addView(sectionLabel(activity, "Ovládanie"));
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout volume = new LinearLayout(activity);
        volume.setOrientation(LinearLayout.VERTICAL);
        volume.addView(key("Hlas +", LgCodes.VOL_UP, true), vlp());
        volume.addView(key("🔇", LgCodes.MUTE, false), vlp());
        volume.addView(key("Hlas −", LgCodes.VOL_DOWN, true), vlp());

        LinearLayout pad = new LinearLayout(activity);
        pad.setOrientation(LinearLayout.VERTICAL);
        pad.addView(row(activity, key("▲", LgCodes.UP, true)));
        pad.addView(row(activity,
                key("◀", LgCodes.LEFT, true),
                key("OK", LgCodes.OK, false, ACCENT, TEXT),
                key("▶", LgCodes.RIGHT, true)));
        pad.addView(row(activity, key("▼", LgCodes.DOWN, true)));

        LinearLayout channel = new LinearLayout(activity);
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
                LinearLayout.LayoutParams.MATCH_PARENT, dp(activity, 54));
        lp.setMargins(dp(activity, 3), dp(activity, 3), dp(activity, 3), dp(activity, 3));
        return lp;
    }

    private void buildExtras() {
        root.addView(sectionLabel(activity, "Menu"));
        root.addView(row(activity,
                key("Menu", LgCodes.MENU, false),
                key("Q.Menu", LgCodes.Q_MENU, false),
                key("Naspäť", LgCodes.BACK, false),
                key("Exit", LgCodes.EXIT, false)));
        root.addView(row(activity,
                key("Info", LgCodes.INFO, false),
                key("Program", LgCodes.GUIDE, false),
                key("Pomer", LgCodes.RATIO, false),
                key("AV režim", LgCodes.AV_MODE, false)));
        root.addView(row(activity,
                key("3D", LgCodes.THREE_D, false, 0xFF6D28D9, TEXT),
                key("Simplink", LgCodes.SIMPLINK, false),
                key("Teletext", LgCodes.TEXT, false),
                key("Časovač", LgCodes.SLEEP, false)));
    }

    private void buildNumbers() {
        final Button[] toggle = new Button[1];
        toggle[0] = button(activity, "Číslice ▾", SURFACE, TEXT, false, new Ui.Press() {
            @Override public void fire() {
                numbersVisible = !numbersVisible;
                numbersBlock.setVisibility(numbersVisible ? View.VISIBLE : View.GONE);
                toggle[0].setText(numbersVisible ? "Číslice ▴" : "Číslice ▾");
            }
        });
        root.addView(sectionLabel(activity, "Kanály priamo"));
        root.addView(row(activity, toggle[0]));

        numbersBlock = new LinearLayout(activity);
        numbersBlock.setOrientation(LinearLayout.VERTICAL);
        numbersBlock.setVisibility(View.GONE);
        numbersBlock.addView(row(activity,
                key("1", LgCodes.digit(1), false),
                key("2", LgCodes.digit(2), false),
                key("3", LgCodes.digit(3), false)));
        numbersBlock.addView(row(activity,
                key("4", LgCodes.digit(4), false),
                key("5", LgCodes.digit(5), false),
                key("6", LgCodes.digit(6), false)));
        numbersBlock.addView(row(activity,
                key("7", LgCodes.digit(7), false),
                key("8", LgCodes.digit(8), false),
                key("9", LgCodes.digit(9), false)));
        numbersBlock.addView(row(activity,
                key("Obľúbené", LgCodes.FAV, false),
                key("0", LgCodes.digit(0), false),
                key("Zoznam", LgCodes.Q_VIEW, false)));
        root.addView(numbersBlock);
    }

    private void buildColors() {
        root.addView(sectionLabel(activity, "Farebné tlačidlá"));
        root.addView(row(activity,
                key(" ", LgCodes.RED, false, 0xFFB91C1C, TEXT),
                key(" ", LgCodes.GREEN, false, 0xFF15803D, TEXT),
                key(" ", LgCodes.YELLOW, false, 0xFFCA8A04, TEXT),
                key(" ", LgCodes.BLUE, false, 0xFF1D4ED8, TEXT)));
    }

    private void buildMedia() {
        root.addView(sectionLabel(activity, "Prehrávanie"));
        root.addView(row(activity,
                key("⏮", LgCodes.PREV, false),
                key("▶", LgCodes.PLAY, false),
                key("⏸", LgCodes.PAUSE, false),
                key("⏹", LgCodes.STOP, false),
                key("⏭", LgCodes.NEXT, false)));
    }

    private void buildScannerLink() {
        root.addView(sectionLabel(activity, "Ak niečo nefunguje"));
        root.addView(row(activity, button(activity, "Skener kódov", SURFACE, Ui.MUTED, false,
                new Ui.Press() {
                    @Override public void fire() {
                        activity.startActivity(new Intent(activity, ScannerActivity.class));
                    }
                })));
    }
}
