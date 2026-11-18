package sk.lgremote;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import static sk.lgremote.Ui.ACCENT;
import static sk.lgremote.Ui.BG;
import static sk.lgremote.Ui.MUTED;
import static sk.lgremote.Ui.SURFACE;
import static sk.lgremote.Ui.TEXT;
import static sk.lgremote.Ui.button;
import static sk.lgremote.Ui.dp;
import static sk.lgremote.Ui.row;
import static sk.lgremote.Ui.sectionLabel;

/**
 * Skener kodov: posiela lubovolne cislo tlacidla (OBC 0-255) alebo cely hex ramec.
 * Sluzi na dohladanie tlacidiel, ktorych kod nie je v tabulke overeny (napr. 3D).
 */
public class ScannerActivity extends Activity {

    private IrSender ir;
    private int obc = 0;
    private TextView readout;
    private EditText hexInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ir = new IrSender(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(this, 14), dp(this, 18), dp(this, 14), dp(this, 24));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Skener kódov");
        title.setTextColor(TEXT);
        title.setTextSize(21);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        root.addView(Ui.note(this,
                "Prechádzaj čísla tlačidiel a sleduj, čo televízor urobí. "
                + "Keď nájdeš to správne, napíš mi číslo a pridám ho do ovládača.",
                MUTED));

        readout = new TextView(this);
        readout.setTextColor(ACCENT);
        readout.setTextSize(19);
        readout.setGravity(Gravity.CENTER);
        readout.setPadding(0, dp(this, 10), 0, dp(this, 10));
        readout.setBackground(Ui.pill(this, SURFACE, 14));
        root.addView(readout);
        updateReadout();

        root.addView(sectionLabel(this, "Číslo tlačidla"));
        root.addView(row(this,
                button(this, "−10", SURFACE, TEXT, false, new Ui.Press() {
                    @Override public void fire() { step(-10); }
                }),
                button(this, "−1", SURFACE, TEXT, false, new Ui.Press() {
                    @Override public void fire() { step(-1); }
                }),
                button(this, "+1", SURFACE, TEXT, false, new Ui.Press() {
                    @Override public void fire() { step(1); }
                }),
                button(this, "+10", SURFACE, TEXT, false, new Ui.Press() {
                    @Override public void fire() { step(10); }
                })));
        root.addView(row(this,
                button(this, "Odoslať", ACCENT, TEXT, false, new Ui.Press() {
                    @Override public void fire() {
                        ir.sendObc(obc);
                    }
                })));

        root.addView(sectionLabel(this, "Vlastný hex kód"));
        hexInput = new EditText(this);
        hexInput.setHint("napr. 20DF3BC4");
        hexInput.setHintTextColor(MUTED);
        hexInput.setTextColor(TEXT);
        hexInput.setInputType(InputType.TYPE_CLASS_TEXT);
        hexInput.setBackground(Ui.pill(this, SURFACE, 12));
        hexInput.setPadding(dp(this, 14), dp(this, 14), dp(this, 14), dp(this, 14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(this, 3), dp(this, 6), dp(this, 3), dp(this, 3));
        root.addView(hexInput, lp);
        root.addView(row(this,
                button(this, "Odoslať hex", SURFACE, TEXT, false, new Ui.Press() {
                    @Override public void fire() { sendHex(); }
                })));

        setContentView(scroll);
    }

    private void step(int delta) {
        obc = ((obc + delta) % 256 + 256) % 256;
        updateReadout();
    }

    private void updateReadout() {
        readout.setText(String.format("číslo %d  ·  %08X", obc, IrSender.frameForObc(obc)));
    }

    private void sendHex() {
        String raw = hexInput.getText().toString().trim()
                .replace("0x", "").replace("0X", "").replace(" ", "");
        if (raw.isEmpty()) {
            return;
        }
        try {
            long frame = Long.parseLong(raw, 16);
            ir.sendFrame(frame);
            readout.setText(String.format("odoslané %08X", frame));
        } catch (NumberFormatException e) {
            readout.setText("neplatný hex");
        }
    }
}
