package sk.lgremote;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import sk.lgremote.pages.LgPage;
import sk.lgremote.pages.MiBoxPage;
import sk.lgremote.pages.RemotePage;
import sk.lgremote.pages.SoonPage;

/**
 * Drzi vsetky ovladace vedla seba — listuje sa medzi nimi prstom.
 */
public class MainActivity extends Activity {

    private final List<RemotePage> pages = Arrays.asList(
            new LgPage(),
            new MiBoxPage(),
            new SoonPage(3, Ui.BG_GREEN),
            new SoonPage(4, Ui.BG_PURPLE));

    private LinearLayout screen;
    private TextView title;
    private TextView subtitle;
    private final List<View> dots = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(pages.get(0).background());
        screen = root;

        root.addView(buildHeader());

        ViewPager2 pager = new ViewPager2(this);
        pager.setAdapter(new PageAdapter());
        pager.setOffscreenPageLimit(1);
        pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback() {
            @Override public void onPageSelected(int position) {
                showPage(position);
            }
        });
        root.addView(pager, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        root.addView(buildDots());
        showPage(0);
        setContentView(root);
    }

    private View buildHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(Ui.dp(this, 16), Ui.dp(this, 14), Ui.dp(this, 16), Ui.dp(this, 6));

        title = new TextView(this);
        title.setTextColor(Ui.TEXT);
        title.setTextSize(21);
        title.setGravity(Gravity.CENTER);
        header.addView(title);

        subtitle = new TextView(this);
        subtitle.setTextColor(Ui.MUTED);
        subtitle.setTextSize(12);
        subtitle.setGravity(Gravity.CENTER);
        header.addView(subtitle);
        return header;
    }

    private View buildDots() {
        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        strip.setGravity(Gravity.CENTER);
        strip.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 14));
        for (int i = 0; i < pages.size(); i++) {
            View dot = new View(this);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    Ui.dp(this, 7), Ui.dp(this, 7));
            lp.setMargins(Ui.dp(this, 5), 0, Ui.dp(this, 5), 0);
            dot.setLayoutParams(lp);
            strip.addView(dot);
            dots.add(dot);
        }
        return strip;
    }

    private void showPage(int position) {
        RemotePage page = pages.get(position);
        screen.setBackgroundColor(page.background());
        title.setText(page.title());
        subtitle.setText(page.subtitle());
        for (int i = 0; i < dots.size(); i++) {
            dots.get(i).setBackground(Ui.pill(this,
                    i == position ? Ui.ACCENT : 0xFF3A3A44, 4));
        }
    }

    @Override
    protected void onDestroy() {
        for (RemotePage page : pages) {
            page.release();
        }
        super.onDestroy();
    }

    private class PageAdapter extends RecyclerView.Adapter<PageHolder> {

        @NonNull
        @Override
        public PageHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            FrameLayout container = new FrameLayout(MainActivity.this);
            container.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            container.setBackgroundColor(Color.TRANSPARENT);
            container.setClipChildren(false);
            return new PageHolder(container);
        }

        @Override
        public void onBindViewHolder(@NonNull PageHolder holder, int position) {
            FrameLayout container = (FrameLayout) holder.itemView;
            // Kazda stranka ma vlastny typ, takze recyklovany ramec patri
            // tej istej stranke. Obsah sa stavia raz — inak by sa napriklad
            // spojenie s boxom nadvazovalo zakazdym znova.
            if (container.getChildCount() == 0) {
                container.addView(pages.get(position).create(MainActivity.this));
            }
        }

        @Override
        public int getItemCount() {
            return pages.size();
        }

        @Override
        public int getItemViewType(int position) {
            return position;
        }
    }

    private static class PageHolder extends RecyclerView.ViewHolder {
        PageHolder(View itemView) {
            super(itemView);
        }
    }
}
