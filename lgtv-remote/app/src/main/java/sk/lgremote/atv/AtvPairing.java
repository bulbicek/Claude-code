package sk.lgremote.atv;

import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLSocket;

/**
 * Parovanie s Android TV (port 6467).
 *
 * Priebeh: appka poziada o parovanie, box ukaze na obrazovke sestmiestny kod
 * a ten kod spolu s verejnymi klucmi oboch stran tvori spolocny odtlacok.
 * Tym sa obe strany navzajom overia bez certifikacnej autority.
 */
public class AtvPairing implements Runnable {

    public static final int PORT = 6467;

    public interface Listener {
        void onLog(String line);
        void onCodeRequested();
        void onPaired();
        void onError(String message);
    }

    private final String host;
    private final String clientName;
    private final Listener listener;
    private final ArrayBlockingQueue<String> code = new ArrayBlockingQueue<>(1);

    public AtvPairing(String host, String clientName, Listener listener) {
        this.host = host;
        this.clientName = clientName;
        this.listener = listener;
    }

    /** Zavola sa, ked pouzivatel opise kod z obrazovky. */
    public void submitCode(String value) {
        code.offer(value);
    }

    @Override
    public void run() {
        SSLSocket socket = null;
        try {
            listener.onLog("pripajam sa na " + host + ":" + PORT);
            socket = AtvCrypto.connect(host, PORT, 10000);
            listener.onLog("TLS spojenie hotove");
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();

            AtvFrames.write(out, pairingRequest());
            listener.onLog("poziadavka na parovanie odoslana");

            while (true) {
                Proto.Reader msg = new Proto.Reader(AtvFrames.read(in));
                long status = msg.getVarint(2, 0);
                if (status != 200) {
                    listener.onError("box odmietol parovanie (stav " + status + ")");
                    return;
                }
                if (msg.has(11)) {
                    listener.onLog("box prijal poziadavku, posielam moznosti");
                    AtvFrames.write(out, options());
                } else if (msg.has(20)) {
                    listener.onLog("posielam nastavenie");
                    AtvFrames.write(out, configuration());
                } else if (msg.has(31)) {
                    listener.onLog("box ukazuje kod na obrazovke");
                    listener.onCodeRequested();
                    while (true) {
                        String entered = code.poll(3, TimeUnit.MINUTES);
                        if (entered == null) {
                            listener.onError("kod nebol zadany vcas");
                            return;
                        }
                        try {
                            // Odtlacok sa overi este pred odoslanim, takze preklep
                            // nezhodi parovanie a kod sa da zadat znova.
                            AtvFrames.write(out, secret(socket, entered));
                            listener.onLog("kod odoslany");
                            break;
                        } catch (InvalidCodeException e) {
                            listener.onError(e.getMessage());
                            listener.onCodeRequested();
                        }
                    }
                } else if (msg.has(41)) {
                    listener.onLog("box potvrdil parovanie");
                    listener.onPaired();
                    return;
                } else {
                    listener.onError("neocakavana odpoved pri parovani");
                    return;
                }
            }
        } catch (InvalidCodeException e) {
            listener.onError(e.getMessage());
        } catch (Exception e) {
            listener.onError(popis(e));
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {
                    // spojenie uz je zatvorene
                }
            }
        }
    }

    static String popis(Exception e) {
        String name = e.getClass().getSimpleName();
        String msg = e.getMessage();
        return msg == null || msg.isEmpty() ? name : name + ": " + msg;
    }

    private static Proto.Writer outer() {
        return new Proto.Writer().varint(1, 2).varint(2, 200);
    }

    private Proto.Writer pairingRequest() {
        Proto.Writer req = new Proto.Writer()
                .string(1, "atvremote")
                .string(2, clientName);
        return outer().message(10, req);
    }

    private static Proto.Writer encoding() {
        // typ 3 = sestnastkovy kod, dlzka 6 znakov
        return new Proto.Writer().varint(1, 3).varint(2, 6);
    }

    private static Proto.Writer options() {
        Proto.Writer opts = new Proto.Writer()
                .message(1, encoding())
                .varint(3, 1);  // rola: vstup
        return outer().message(20, opts);
    }

    private static Proto.Writer configuration() {
        Proto.Writer cfg = new Proto.Writer()
                .message(1, encoding())
                .varint(2, 1);
        return outer().message(30, cfg);
    }

    private Proto.Writer secret(SSLSocket socket, String entered) throws Exception {
        String clean = entered.trim();
        if (clean.length() != 6) {
            throw new InvalidCodeException("kod musi mat presne 6 znakov");
        }
        byte[] tail;
        int head;
        try {
            head = Integer.parseInt(clean.substring(0, 2), 16);
            tail = hex(clean.substring(2));
        } catch (NumberFormatException e) {
            throw new InvalidCodeException("kod musi byt sestnastkovy (0-9, A-F)");
        }

        X509Certificate clientCert = AtvCrypto.clientCertificate();
        X509Certificate serverCert =
                (X509Certificate) socket.getSession().getPeerCertificates()[0];
        RSAPublicKey client = AtvCrypto.rsaKey(clientCert);
        RSAPublicKey server = AtvCrypto.rsaKey(serverCert);

        byte[] digest = digest(client, server, tail);

        if ((digest[0] & 0xFF) != head) {
            throw new InvalidCodeException("kod nesedi — opis ho z obrazovky znova");
        }
        return outer().message(40, new Proto.Writer().bytes(1, digest));
    }

    /**
     * Spolocny odtlacok oboch stran: verejne kluce klienta aj boxu
     * a posledne styri znaky kodu z obrazovky.
     */
    static byte[] digest(RSAPublicKey client, RSAPublicKey server, byte[] tail)
            throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        sha.update(AtvCrypto.toBytes(client.getModulus()));
        sha.update(AtvCrypto.toBytes(client.getPublicExponent()));
        sha.update(AtvCrypto.toBytes(server.getModulus()));
        sha.update(AtvCrypto.toBytes(server.getPublicExponent()));
        sha.update(tail);
        return sha.digest();
    }

    static byte[] hex(String s) {
        int n = s.length() / 2;
        byte[] out = new byte[n];
        for (int i = 0; i < n; i++) {
            out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    static class InvalidCodeException extends Exception {
        InvalidCodeException(String message) {
            super(message);
        }
    }
}
