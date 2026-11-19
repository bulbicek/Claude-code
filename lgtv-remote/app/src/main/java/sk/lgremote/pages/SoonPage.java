package sk.lgremote.pages;

import android.app.Activity;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import sk.lgremote.Ui;

/** Miesto pripravene pre dalsi ovladac. */
public class SoonPage implements RemotePage {

    private final int number;
    private final int background;

    public SoonPage(int number, int background) {
        this.number = number;
        this.background = background;
    }

    @Override
    public int background() {
        return background;
    }

    @Override
    public String title() {
        return "Ovládač " + number;
    }

    @Override
    public String subtitle() {
        return "zatiaľ prázdne";
    }

    @Override
    public View create(Activity a) {
        LinearLayout root = new LinearLayout(a);
        root.setBackgroundColor(background);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(Ui.dp(a, 32), Ui.dp(a, 32), Ui.dp(a, 32), Ui.dp(a, 32));

        TextView icon = new TextView(a);
        icon.setText("＋");
        icon.setTextColor(Ui.MUTED);
        icon.setTextSize(48);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        TextView text = new TextView(a);
        text.setText("Tu bude ďalší ovládač.\n\n"
                + "Stačí odfotiť ten pôvodný a poslať fotku —\n"
                + "podľa tlačidiel doplním túto stránku.");
        text.setTextColor(Ui.MUTED);
        text.setTextSize(15);
        text.setGravity(Gravity.CENTER);
        text.setLineSpacing(Ui.dp(a, 4), 1f);
        root.addView(text);
        return root;
    }
}
