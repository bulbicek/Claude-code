package sk.lgremote.pages;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import sk.lgremote.Ui;
import sk.lgremote.atv.AtvPairing;
import sk.lgremote.atv.AtvRemote;
import sk.lgremote.atv.WakeOnLan;

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
 * Xiaomi Mi Box 4K — ovladany cez siet protokolom Android TV Remote.
 *
 * Povodny ovladac je bluetoothovy, takze infracervena cesta ako pri LG tu
 * nefunguje. Box ale pocuva na sieti rovnaky protokol, aky pouziva oficialna
 * appka Google TV.
 */
public class MiBoxPage implements RemotePage {

    private static final String PREFS = "atv";
    private static final String KEY_HOST = "host";
    private static final String KEY_MAC = "mac";
    private static final String SERVICE_TYPE = "_androidtvremote2._tcp.";

    // Kody tlacidiel su obycajne Android KeyEvent hodnoty
    private static final int K_POWER = 26;    // prepinac
    private static final int K_SLEEP = 223;   // uspat
    private static final int K_WAKEUP = 224;  // zobudit
    private static final int K_HOME = 3;
    private static final int K_BACK = 4;
    private static final int K_UP = 19;
    private static final int K_DOWN = 20;
    private static final int K_LEFT = 21;
    private static final int K_RIGHT = 22;
    private static final int K_OK = 23;
    private static final int K_VOL_UP = 24;
    private static final int K_VOL_DOWN = 25;
    private static final int K_MUTE = 164;
    private static final int K_PLAY_PAUSE = 85;
    private static final int K_NEXT = 87;
    private static final int K_PREV = 88;
    private static final int K_REWIND = 89;
    private static final int K_FORWARD = 90;
    private static final int K_ASSIST = 219;
    private static final int K_SETTINGS = 176;
    private static final int K_GUIDE = 172;

    private Activity activity;
    private SharedPreferences prefs;
    private AtvRemote remote;
    private TextView status;
    private final StringBuilder log = new StringBuilder();
    private TextView logView;
    private LinearLayout logBlock;
    private NsdManager nsd;
    private NsdManager.DiscoveryListener discoveryListener;

    @Override
    public String title() {
        return "Xiaomi Mi Box";
    }

    @Override
    public String subtitle() {
        return "MDZ-28-AA · cez WiFi";
    }

    @Override
    public int background() {
        return Ui.BG_RED;
    }

    @Override
    public View create(Activity a) {
        this.activity = a;
        this.prefs = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sk.lgremote.atv.AtvCrypto.init(a.getFilesDir());

        ScrollView scroll = new ScrollView(a);
        scroll.setBackgroundColor(background());
        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(a, 10), dp(a, 4), dp(a, 10), dp(a, 24));
        scroll.addView(root);

        status = new TextView(a);
        status.setTextColor(MUTED);
        status.setTextSize(13);
        status.setGravity(Gravity.CENTER);
        status.setPadding(dp(a, 10), dp(a, 10), dp(a, 10), dp(a, 10));
        status.setBackground(Ui.pill(a, SURFACE, 12));
        root.addView(status);
        setStatus("nepripojené");

        root.addView(row(a,
                button(a, "Nájsť box", SURFACE, TEXT, false, this::discover),
                button(a, "Adresy", SURFACE, TEXT, false, this::askForHost),
                button(a, "Spárovať", ACCENT, TEXT, false, this::startPairing)));

        root.addView(sectionLabel(a, "Napájanie"));
        root.addView(row(a,
                button(a, "Zapnúť", 0xFF15803D, TEXT, false, this::wakeUp),
                powerKey("⏻", K_POWER, DANGER),
                powerKey("Uspať", K_SLEEP, 0xFF7F1D1D)));
        root.addView(Ui.note(a,
                "Box si v spánku vypína WiFi, takže zo spánku ho prebudí "
                + "len pôvodný ovládač. Ak má byť appka vždy po ruke, "
                + "vypni na boxe automatické uspávanie.", MUTED));

        root.addView(sectionLabel(a, "Ovládanie"));
        LinearLayout block = new LinearLayout(a);
        block.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout volume = new LinearLayout(a);
        volume.setOrientation(LinearLayout.VERTICAL);
        volume.addView(key("Hlas +", K_VOL_UP, true), vlp());
        volume.addView(key("🔇", K_MUTE, false), vlp());
        volume.addView(key("Hlas −", K_VOL_DOWN, true), vlp());

        LinearLayout pad = new LinearLayout(a);
        pad.setOrientation(LinearLayout.VERTICAL);
        pad.addView(row(a, key("▲", K_UP, true)));
        pad.addView(row(a,
                key("◀", K_LEFT, true),
                key("OK", K_OK, false, ACCENT, TEXT),
                key("▶", K_RIGHT, true)));
        pad.addView(row(a, key("▼", K_DOWN, true)));

        LinearLayout side = new LinearLayout(a);
        side.setOrientation(LinearLayout.VERTICAL);
        side.addView(key("Naspäť", K_BACK, false), vlp());
        side.addView(key("Domov", K_HOME, false), vlp());
        side.addView(key("🎤", K_ASSIST, false), vlp());

        block.addView(volume, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        block.addView(pad, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1.4f));
        block.addView(side, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(block);

        root.addView(sectionLabel(a, "Prehrávanie"));
        root.addView(row(a,
                key("⏪", K_REWIND, false),
                key("⏮", K_PREV, false),
                key("⏯", K_PLAY_PAUSE, false, ACCENT, TEXT),
                key("⏭", K_NEXT, false),
                key("⏩", K_FORWARD, false)));

        root.addView(sectionLabel(a, "Aplikácie"));
        root.addView(row(a,
                app("Netflix", "https://www.netflix.com", 0xFFB91C1C),
                app("YouTube", "https://www.youtube.com", 0xFF7F1D1D)));
        root.addView(row(a,
                app("Prime Video", "https://app.primevideo.com", 0xFF1D4ED8),
                app("Disney+", "https://www.disneyplus.com", 0xFF3730A3)));

        root.addView(sectionLabel(a, "Ďalšie"));
        root.addView(row(a,
                key("Program", K_GUIDE, false),
                key("Nastavenia", K_SETTINGS, false)));

        buildLog(a, root);
        connectIfPossible();
        return scroll;
    }

    private LinearLayout.LayoutParams vlp() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(activity, 54));
        lp.setMargins(dp(activity, 3), dp(activity, 3), dp(activity, 3), dp(activity, 3));
        return lp;
    }

    private Button key(String label, int code, boolean repeat) {
        return key(label, code, repeat, SURFACE, TEXT);
    }

    private Button key(String label, final int code, boolean repeat, int fill, int textColor) {
        return button(activity, label, fill, textColor, repeat, () -> sendKey(code));
    }

    /**
     * Zobudenie boxu.
     *
     * Ked spojenie stoji, staci tlacidlo. Ked box spi a zo siete zmizol,
     * posle sa kuzelny paket — ten pocuva sietova karta aj v spanku —
     * a potom sa par krat skusi pripojit, kym box nabehne.
     */
    private void wakeUp() {
        AtvRemote r = remote;
        if (r != null && r.isReady()) {
            appendLog("napájanie: Zapnúť (kód " + K_WAKEUP + ")");
            r.sendKey(K_WAKEUP);
            return;
        }
        final String mac = prefs.getString(KEY_MAC, null);
        if (mac == null || mac.isEmpty()) {
            setStatus("na zobudenie treba MAC adresu boxu");
            askForHost();
            return;
        }
        final String host = host();
        setStatus("budím box …");
        Thread t = new Thread(() -> {
            try {
                WakeOnLan.send(mac, host);
                appendLog("kúzelný paket odoslaný na " + mac);
            } catch (Exception e) {
                appendLog("paket sa neodoslal: " + e.getMessage());
                ui(() -> setStatus("zobudenie zlyhalo: " + e.getMessage()));
                return;
            }
            // Rychle tukanie na port namiesto plneho pripajania: ked je box
            // mimo siete, odpoved pride hned a netreba cakat desat sekund.
            for (int pokus = 1; pokus <= 8; pokus++) {
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                if (odpovedaPort(host)) {
                    appendLog("box je spat v sieti, pripájam sa");
                    ui(this::connectIfPossible);
                    return;
                }
                appendLog("box zatiaľ nie je v sieti (" + pokus + "/8)");
            }
            ui(() -> setStatus("box má v spánku vypnutú WiFi — zobudiť sa cez sieť nedá"));
        }, "atv-wake");
        t.setDaemon(true);
        t.start();
    }

    /** Odpoveda box na porte ovladania? Kratke cakanie, len na zistenie. */
    private static boolean odpovedaPort(String host) {
        if (host == null) {
            return false;
        }
        try (java.net.Socket probe = new java.net.Socket()) {
            probe.connect(new java.net.InetSocketAddress(host, AtvRemote.PORT), 1500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Button powerKey(final String label, final int code, int fill) {
        return button(activity, label, fill, TEXT, false, () -> {
            appendLog("napájanie: " + label + " (kód " + code + ")");
            sendKey(code);
        });
    }

    private Button app(String label, final String link, int fill) {
        return button(activity, label, fill, TEXT, false, () -> {
            AtvRemote r = remote;
            if (r == null || !r.launchApp(link)) {
                setStatus("box nie je pripojený");
            }
        });
    }

    private void sendKey(int code) {
        AtvRemote r = remote;
        if (r != null && r.sendKey(code)) {
            return;
        }
        // Box mohol medzitym zaspat. Tlacidlo si odlozime a posleme ho,
        // len co sa spojenie obnovi — inak by sa prve stlacenie stratilo.
        pendingKey = code;
        pendingSince = System.currentTimeMillis();
        setStatus("box neodpovedá, skúšam sa pripojiť …");
        connectIfPossible();
    }

    private volatile int pendingKey = -1;
    private volatile long pendingSince;

    private void flushPendingKey() {
        int code = pendingKey;
        pendingKey = -1;
        AtvRemote r = remote;
        if (code < 0 || r == null) {
            return;
        }
        if (System.currentTimeMillis() - pendingSince > 15000) {
            appendLog("odložené tlačidlo je už staré, zahadzujem ho");
            return;
        }
        appendLog("posielam odložené tlačidlo " + code);
        r.sendKey(code);
    }

    // ---------- spojenie ----------

    private String host() {
        return prefs.getString(KEY_HOST, null);
    }

    private void connectIfPossible() {
        String host = host();
        if (host == null) {
            setStatus("box ešte nie je nastavený");
            return;
        }
        if (remote != null && remote.isReady()) {
            return;
        }
        if (remote != null) {
            remote.close();
        }
        setStatus("pripájam sa na " + host + " …");
        remote = new AtvRemote(host, new AtvRemote.Listener() {
            @Override public void onLog(String line) {
                appendLog(line);
            }
            @Override public void onReady(String deviceName) {
                ui(() -> {
                    setStatus("pripojené · " + deviceName);
                    flushPendingKey();
                });
            }
            @Override public void onClosed(String reason) {
                ui(() -> setStatus("odpojené (" + reason + ")"));
            }
        });
        remote.connect();
    }

    private void startPairing() {
        String host = host();
        if (host == null) {
            askForHost();
            return;
        }
        if (remote != null) {
            remote.close();
            remote = null;
        }
        setStatus("párujem s " + host + " …");
        AtvPairing pairing = new AtvPairing(host, android.os.Build.MODEL,
                new AtvPairing.Listener() {
                    @Override public void onLog(String line) {
                        appendLog(line);
                    }
                    @Override public void onCodeRequested() {
                        ui(() -> askForCode(pairingRef[0]));
                    }
                    @Override public void onPaired() {
                        ui(() -> {
                            setStatus("spárované, pripájam sa …");
                            connectIfPossible();
                        });
                    }
                    @Override public void onError(String message) {
                        appendLog("chyba: " + message);
                        ui(() -> setStatus(message));
                    }
                });
        pairingRef[0] = pairing;
        Thread t = new Thread(pairing, "atv-pairing");
        t.setDaemon(true);
        t.start();
    }

    private final AtvPairing[] pairingRef = new AtvPairing[1];

    private void askForCode(final AtvPairing pairing) {
        final EditText input = new EditText(activity);
        input.setHint("napr. A1B2C3");
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        new AlertDialog.Builder(activity)
                .setTitle("Kód z obrazovky")
                .setMessage("Na televízore sa zobrazil šesťmiestny kód. Opíš ho sem.")
                .setView(input)
                .setCancelable(false)
                .setPositiveButton("Potvrdiť", (d, w) ->
                        pairing.submitCode(input.getText().toString()))
                .setNegativeButton("Zrušiť", (d, w) -> setStatus("párovanie zrušené"))
                .show();
    }

    private void askForHost() {
        final EditText ip = new EditText(activity);
        ip.setHint("IP, napr. 192.168.0.100");
        ip.setText(host() == null ? "" : host());
        ip.setInputType(InputType.TYPE_CLASS_TEXT);

        final EditText mac = new EditText(activity);
        mac.setHint("MAC, napr. 28:6C:07:AA:BB:CC");
        mac.setText(prefs.getString(KEY_MAC, ""));
        mac.setInputType(InputType.TYPE_CLASS_TEXT);

        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(activity, 20), dp(activity, 8), dp(activity, 20), 0);
        box.addView(ip);
        box.addView(mac);

        new AlertDialog.Builder(activity)
                .setTitle("Adresy boxu")
                .setMessage("Obe nájdeš na boxe v Nastavenia → Sieť a internet, "
                        + "po otvorení pripojenej siete. MAC adresa je potrebná "
                        + "na zobudenie boxu zo spánku.")
                .setView(box)
                .setPositiveButton("Uložiť", (d, w) -> {
                    String ipValue = ip.getText().toString().trim();
                    String macValue = mac.getText().toString().trim();
                    SharedPreferences.Editor edit = prefs.edit();
                    if (!ipValue.isEmpty()) {
                        edit.putString(KEY_HOST, ipValue);
                    }
                    edit.putString(KEY_MAC, macValue);
                    edit.apply();
                    setStatus("adresy uložené");
                    connectIfPossible();
                })
                .setNegativeButton("Zrušiť", null)
                .show();
    }

    /** Pokusi sa najst box sam cez mDNS, aby pouzivatel nemusel hladat IP. */
    private void discover() {
        stopDiscovery();
        setStatus("hľadám box v sieti …");
        nsd = (NsdManager) activity.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) {
            setStatus("hľadanie v sieti sa nedá spustiť");
            return;
        }
        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override public void onStartDiscoveryFailed(String type, int code) {
                ui(() -> setStatus("hľadanie zlyhalo (" + code + ")"));
            }
            @Override public void onStopDiscoveryFailed(String type, int code) {
            }
            @Override public void onDiscoveryStarted(String type) {
                appendLog("hľadám " + type);
            }
            @Override public void onDiscoveryStopped(String type) {
            }
            @Override public void onServiceFound(NsdServiceInfo info) {
                appendLog("našiel som " + info.getServiceName());
                nsd.resolveService(info, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo i, int code) {
                        appendLog("adresu sa nepodarilo zistiť (" + code + ")");
                    }
                    @Override public void onServiceResolved(NsdServiceInfo i) {
                        final String address = i.getHost().getHostAddress();
                        prefs.edit().putString(KEY_HOST, address).apply();
                        ui(() -> {
                            setStatus("našiel som box na " + address);
                            stopDiscovery();
                            connectIfPossible();
                        });
                    }
                });
            }
            @Override public void onServiceLost(NsdServiceInfo info) {
            }
        };
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
        } catch (Exception e) {
            setStatus("hľadanie sa nepodarilo spustiť");
        }
    }

    private void stopDiscovery() {
        if (nsd != null && discoveryListener != null) {
            try {
                nsd.stopServiceDiscovery(discoveryListener);
            } catch (Exception ignored) {
                // hladanie uz nebezi
            }
            discoveryListener = null;
        }
    }

    // ---------- diagnostika ----------

    private void buildLog(Activity a, LinearLayout root) {
        final Button[] toggle = new Button[1];
        toggle[0] = button(a, "Diagnostika ▾", SURFACE, MUTED, false, () -> {
            boolean show = logBlock.getVisibility() != View.VISIBLE;
            logBlock.setVisibility(show ? View.VISIBLE : View.GONE);
            toggle[0].setText(show ? "Diagnostika ▴" : "Diagnostika ▾");
        });
        root.addView(sectionLabel(a, "Ak sa nepripojí"));
        root.addView(row(a, toggle[0]));

        logBlock = new LinearLayout(a);
        logBlock.setOrientation(LinearLayout.VERTICAL);
        logBlock.setVisibility(View.GONE);
        logView = new TextView(a);
        logView.setTextColor(MUTED);
        logView.setTextSize(12);
        logView.setTypeface(android.graphics.Typeface.MONOSPACE);
        logView.setPadding(dp(a, 12), dp(a, 12), dp(a, 12), dp(a, 12));
        logView.setBackground(Ui.pill(a, 0xFF1A1A20, 12));
        logView.setText("zatiaľ nič");
        logBlock.addView(logView);
        root.addView(logBlock);
    }

    private void appendLog(String line) {
        synchronized (log) {
            log.append(line).append('\n');
            if (log.length() > 4000) {
                log.delete(0, log.length() - 4000);
            }
        }
        ui(() -> {
            if (logView != null) {
                synchronized (log) {
                    logView.setText(log.toString());
                }
            }
        });
    }

    private void setStatus(String text) {
        if (status != null) {
            status.setText(text);
        }
        appendLog("· " + text);
    }

    private void ui(Runnable r) {
        if (activity != null) {
            activity.runOnUiThread(r);
        }
    }

    @Override
    public void release() {
        stopDiscovery();
        if (remote != null) {
            remote.shutdown();
        }
    }
}
