package sk.lgremote;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Pomocnik na skladanie rozhrania bez XML. */
public class Ui {

    public static final int BG        = 0xFF101014;

    // Pozadie kazdeho ovladaca. Rovnako tmave, len iny odtien.
    public static final int BG_BLUE   = 0xFF0D1523;
    public static final int BG_RED    = 0xFF1B0E11;
    public static final int BG_GREEN  = 0xFF0B1711;
    public static final int BG_PURPLE = 0xFF150D1E;

    public static final int SURFACE   = 0xFF26262E;
    public static final int TEXT      = 0xFFF2F2F5;
    public static final int MUTED     = 0xFF8A8A96;
    public static final int ACCENT    = 0xFF3B82F6;
    public static final int DANGER    = 0xFFDC2626;

    private static final int REPEAT_DELAY_MS  = 420;
    private static final int REPEAT_PERIOD_MS = 160;

    public static int dp(Context c, int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, c.getResources().getDisplayMetrics());
    }

    public static GradientDrawable pill(Context c, int fill, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(c, radiusDp));
        return d;
    }

    private static void applyBackground(Context c, View v, int fill, int radiusDp) {
        GradientDrawable base = pill(c, fill, radiusDp);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            v.setBackground(new RippleDrawable(
                    ColorStateList.valueOf(0x55FFFFFF), base, null));
        } else {
            v.setBackground(base);
        }
    }

    public interface Press {
        void fire();
    }

    /** Tlacidlo. repeat = drzanim sa prikaz opakuje (hlasitost, kanaly, sipky). */
    public static Button button(final Activity a, String label, int fill, int textColor,
                                boolean repeat, final Press action) {
        Button b = new Button(a);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(textColor);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setPadding(dp(a, 4), dp(a, 4), dp(a, 4), dp(a, 4));
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setStateListAnimator(null);
        applyBackground(a, b, fill, 14);

        if (repeat) {
            attachRepeat(b, action);
        } else {
            b.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                    action.fire();
                }
            });
        }
        return b;
    }

    private static void attachRepeat(final Button b, final Press action) {
        final Handler handler = new Handler(Looper.getMainLooper());
        final Runnable[] ticker = new Runnable[1];
        ticker[0] = new Runnable() {
            @Override public void run() {
                action.fire();
                handler.postDelayed(ticker[0], REPEAT_PERIOD_MS);
            }
        };
        b.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                        v.setPressed(true);
                        action.fire();
                        handler.postDelayed(ticker[0], REPEAT_DELAY_MS);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.setPressed(false);
                        handler.removeCallbacks(ticker[0]);
                        if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                            v.performClick();
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });
    }

    /** Vodorovny riadok, kazdy prvok rovnako siroky. */
    public static LinearLayout row(Context c, View... children) {
        LinearLayout r = new LinearLayout(c);
        r.setOrientation(LinearLayout.HORIZONTAL);
        for (View child : children) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    0, dp(c, 54), 1f);
            lp.setMargins(dp(c, 3), dp(c, 3), dp(c, 3), dp(c, 3));
            r.addView(child, lp);
        }
        return r;
    }

    public static TextView sectionLabel(Context c, String text) {
        TextView t = new TextView(c);
        t.setText(text);
        t.setTextColor(MUTED);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        t.setAllCaps(true);
        t.setLetterSpacing(0.08f);
        t.setPadding(dp(c, 6), dp(c, 14), dp(c, 6), dp(c, 2));
        return t;
    }

    public static TextView note(Context c, String text, int color) {
        TextView t = new TextView(c);
        t.setText(text);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(c, 10), dp(c, 10), dp(c, 10), dp(c, 10));
        return t;
    }
}
