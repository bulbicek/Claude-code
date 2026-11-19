package sk.lgremote.atv;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.SSLSocket;

/**
 * Relacia s Android TV (port 6466).
 *
 * Po spojeni si box a appka vymenia nastavenie, potom uz appka posiela
 * stlacenia tlacidiel. Box sa priebezne pyta, ci je appka nazive — na to
 * treba odpovedat, inak spojenie zatvori.
 */
public class AtvRemote {

    public static final int PORT = 6466;

    /** Co appka vie: ping, tlacidla, napajanie, hlasitost, spustanie aplikacii. */
    private static final int FEATURES = 1 | 2 | 32 | 64 | 512;

    public interface Listener {
        void onLog(String line);
        void onReady(String deviceName);
        void onClosed(String reason);
    }

    private final String host;
    private final int port;
    private final Listener listener;
    private final AtomicBoolean ready = new AtomicBoolean(false);
    private final AtomicBoolean closingOnPurpose = new AtomicBoolean(false);
    /** Odosielanie musi byt mimo vlakna, ktore kresli obrazovku. */
    private final ExecutorService sender =
            Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(r, "atv-sender");
                t.setDaemon(true);
                return t;
            });
    private volatile String lastWriteThread;
    private volatile SSLSocket socket;
    private volatile OutputStream out;
    private volatile Thread reader;

    public AtvRemote(String host, Listener listener) {
        this(host, PORT, listener);
    }

    /** Port sa da zmenit, aby sa dala relacia otestovat proti falosnemu boxu. */
    public AtvRemote(String host, int port, Listener listener) {
        this.host = host;
        this.port = port;
        this.listener = listener;
    }

    /** Na ktorom vlakne sa naposledy zapisovalo do spojenia. */
    public String lastWriteThread() {
        return lastWriteThread;
    }

    public boolean isReady() {
        return ready.get();
    }

    /** Nadviaze spojenie a necha bezat citacie vlakno. */
    public void connect() {
        if (reader != null && reader.isAlive()) {
            return;
        }
        reader = new Thread(this::loop, "atv-remote");
        reader.setDaemon(true);
        reader.start();
    }

    public void close() {
        closingOnPurpose.set(true);
        ready.set(false);
        SSLSocket s = socket;
        if (s != null) {
            try {
                s.close();
            } catch (Exception ignored) {
                // uz je zatvorene
            }
        }
    }

    private void loop() {
        String reason = "spojenie sa skoncilo";
        try {
            listener.onLog("pripajam sa na " + host + ":" + port);
            SSLSocket s = AtvCrypto.connect(host, port, 10000);
            s.setSoTimeout(0);  // box posiela spravy aj po dlhsom tichu
            socket = s;
            out = s.getOutputStream();
            InputStream in = s.getInputStream();
            listener.onLog("TLS spojenie hotove");

            while (true) {
                Proto.Reader msg = new Proto.Reader(AtvFrames.read(in));

                if (msg.has(1)) {
                    Proto.Reader cfg = msg.getMessage(1);
                    String name = nazovZariadenia(cfg);
                    listener.onLog("box sa predstavil: " + name);
                    AtvFrames.write(out, configureReply());
                } else if (msg.has(2)) {
                    AtvFrames.write(out, outer().message(2,
                            new Proto.Writer().varint(1, FEATURES)));
                } else if (msg.has(8)) {
                    Proto.Reader ping = msg.getMessage(8);
                    long val = ping == null ? 0 : ping.getVarint(1, 0);
                    AtvFrames.write(out, outer().message(9,
                            new Proto.Writer().varint(1, val)));
                } else if (msg.has(40)) {
                    ready.set(true);
                    listener.onLog("box je pripraveny");
                    listener.onReady(host);
                } else if (msg.has(3)) {
                    listener.onLog("box ohlasil chybu");
                }
            }
        } catch (Exception e) {
            reason = closingOnPurpose.get() ? "zatvorene appkou" : AtvPairing.popis(e);
        } finally {
            ready.set(false);
            SSLSocket s = socket;
            if (s != null) {
                try {
                    s.close();
                } catch (Exception ignored) {
                    // uz je zatvorene
                }
            }
            socket = null;
            out = null;
            listener.onClosed(reason);
        }
    }

    private static String nazovZariadenia(Proto.Reader configure) {
        if (configure == null) {
            return "neznamy";
        }
        try {
            Proto.Reader info = configure.getMessage(2);
            if (info == null) {
                return "neznamy";
            }
            byte[] model = info.getBytes(1);
            byte[] vendor = info.getBytes(2);
            String m = model == null ? "" : new String(model, "UTF-8");
            String v = vendor == null ? "" : new String(vendor, "UTF-8");
            String name = (v + " " + m).trim();
            return name.isEmpty() ? "neznamy" : name;
        } catch (Exception e) {
            return "neznamy";
        }
    }

    private static Proto.Writer outer() {
        return new Proto.Writer();
    }

    private static Proto.Writer configureReply() {
        Proto.Writer info = new Proto.Writer()
                .string(1, nieJePrazdne(android.os.Build.MODEL, "telefon"))
                .string(2, nieJePrazdne(android.os.Build.MANUFACTURER, "android"))
                .varint(3, 1)
                .string(4, "1")
                .string(5, "atvremote")
                .string(6, "1.0.0");
        Proto.Writer configure = new Proto.Writer()
                .varint(1, FEATURES)
                .message(2, info);
        return outer().message(1, configure);
    }

    /** Udaje o telefone nemusia byt vyplnene; prazdny retazec by zapis zhodil. */
    private static String nieJePrazdne(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    /** Posle stlacenie tlacidla (kod je Android KeyEvent). */
    public boolean sendKey(int keyCode) {
        Proto.Writer inject = new Proto.Writer()
                .varint(1, keyCode)
                .varint(2, 3);  // 3 = kratke stlacenie
        return send(outer().message(10, inject), "tlacidlo");
    }

    /** Spusti aplikaciu podla jej odkazu, napr. https://www.netflix.com. */
    public boolean launchApp(String appLink) {
        return send(outer().message(90, new Proto.Writer().string(1, appLink)),
                "aplikacia");
    }

    /**
     * Zapis sa odovzda vlastnemu vlaknu. Android by zapis po sieti priamo
     * z obsluhy tlacidla odmietol a spojenie by sa zbytocne zhodilo.
     */
    private boolean send(final Proto.Writer message, final String co) {
        if (out == null || !ready.get()) {
            return false;
        }
        try {
            sender.execute(() -> {
                OutputStream o = out;
                if (o == null) {
                    return;
                }
                lastWriteThread = Thread.currentThread().getName();
                try {
                    AtvFrames.write(o, message);
                } catch (Exception e) {
                    listener.onLog(co + " sa neodoslalo: " + AtvPairing.popis(e));
                    close();
                }
            });
            return true;
        } catch (RuntimeException e) {
            listener.onLog(co + " sa neodoslalo: " + AtvPairing.popis(e));
            return false;
        }
    }

    /** Ukonci spojenie aj odosielacie vlakno. */
    public void shutdown() {
        close();
        sender.shutdownNow();
    }
}
