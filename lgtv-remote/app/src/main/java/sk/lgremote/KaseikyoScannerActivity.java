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
import static sk.lgremote.Ui.BG_PURPLE;
import static sk.lgremote.Ui.MUTED;
import static sk.lgremote.Ui.SURFACE;
import static sk.lgremote.Ui.TEXT;
import static sk.lgremote.Ui.button;
import static sk.lgremote.Ui.dp;
import static sk.lgremote.Ui.row;
import static sk.lgremote.Ui.sectionLabel;

/**
 * Hladanie tlacidiel Panasonicu, ktorych kod nie je v databaze.
 *
 * Priestor je mensi ako pri NEC: zariadenie je zname (A0), takze sa
 * prechadzaju len cisla tlacidiel v danej podskupine.
 */
public class KaseikyoScannerActivity extends Activity {

    private IrSender ir;
    private int device = 0xA0;
    private int subdevice = 0x00;
    private int function = 0x00;
    private TextView readout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ir = new IrSender(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG_PURPLE);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(this, 14), dp(this, 18), dp(this, 14), dp(this, 24));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Skener Kaseikyo");
        title.setTextColor(TEXT);
        title.setTextSize(21);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        root.addView(Ui.note(this,
                "Prechádzaj čísla tlačidiel a sleduj soundbar. Známe podskupiny: "
                + "00 hlasitosť a vstupy, 14 zvuk, 1C menu. "
                + "Keď niečo zareaguje, napíš mi podskupinu a číslo.", MUTED));

        readout = new TextView(this);
        readout.setTextColor(ACCENT);
        readout.setTextSize(18);
        readout.setGravity(Gravity.CENTER);
        readout.setPadding(0, dp(this, 10), 0, dp(this, 10));
        readout.setBackground(Ui.pill(this, SURFACE, 14));
        root.addView(readout);
        updateReadout();

        root.addView(sectionLabel(this, "Podskupina"));
        root.addView(row(this,
                button(this, "00", SURFACE, TEXT, false, () -> setSub(0x00)),
                button(this, "14", SURFACE, TEXT, false, () -> setSub(0x14)),
                button(this, "1C", SURFACE, TEXT, false, () -> setSub(0x1C))));

        root.addView(sectionLabel(this, "Číslo tlačidla"));
        root.addView(row(this,
                button(this, "−10", SURFACE, TEXT, false, () -> step(-10)),
                button(this, "−1", SURFACE, TEXT, false, () -> step(-1)),
                button(this, "+1", SURFACE, TEXT, false, () -> step(1)),
                button(this, "+10", SURFACE, TEXT, false, () -> step(10))));
        root.addView(row(this,
                button(this, "Odoslať", ACCENT, TEXT, false, this::send)));

        root.addView(sectionLabel(this, "Vlastné hodnoty"));
        final EditText input = new EditText(this);
        input.setHint("podskupina a číslo, napr. 00 8A");
        input.setHintTextColor(MUTED);
        input.setTextColor(TEXT);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setBackground(Ui.pill(this, SURFACE, 12));
        input.setPadding(dp(this, 14), dp(this, 14), dp(this, 14), dp(this, 14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(this, 3), dp(this, 6), dp(this, 3), dp(this, 3));
        root.addView(input, lp);
        root.addView(row(this,
                button(this, "Odoslať zadané", SURFACE, TEXT, false, () -> {
                    String[] parts = input.getText().toString().trim().split("[\\s,]+");
                    try {
                        if (parts.length == 2) {
                            subdevice = Integer.parseInt(parts[0], 16) & 0xFF;
                            function = Integer.parseInt(parts[1], 16) & 0xFF;
                            updateReadout();
                            send();
                        } else {
                            readout.setText("zadaj dve hodnoty, napr. 00 8A");
                        }
                    } catch (NumberFormatException e) {
                        readout.setText("hodnoty musia byť šestnástkové");
                    }
                })));

        setContentView(scroll);
    }

    private void setSub(int value) {
        subdevice = value;
        updateReadout();
    }

    private void step(int delta) {
        function = ((function + delta) % 256 + 256) % 256;
        updateReadout();
    }

    private void send() {
        ir.sendPattern(Kaseikyo.CARRIER_HZ,
                Kaseikyo.buildPattern(device, subdevice, function));
    }

    private void updateReadout() {
        readout.setText(String.format("podskupina %02X · tlačidlo %02X (%d)",
                subdevice, function, function));
    }
}
