package sk.lgremote.atv;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Totoznost appky voci Android TV: kluc a certifikat klienta.
 *
 * Kluc sa vyraba v samotnej appke a uklada do suboru v jej sukromnom
 * priecinku. Zabezpecene ulozisko Androidu by bolo lakavejsie, ale kluc
 * v nom smie podpisovat len sposobmi, ktore sa urcia pri vyrobe — a box
 * si vypyta RSA-PSS, co take spojenie zhodi.
 *
 * Box si klienta pamata podla certifikatu, takze subor musi prezit
 * restart appky. Ked sa zmaze, parovanie treba zopakovat.
 */
public final class AtvCrypto {

    private static final String FILE_NAME = "atv-client.p12";
    private static final char[] PASSWORD = "atvremote".toCharArray();
    private static final String ALIAS = "client";

    private static File storeFile;
    private static KeyStore cached;

    private AtvCrypto() {}

    /** Zavola sa raz pri starte, nez sa appka skusi pripojit. */
    public static synchronized void init(File filesDir) {
        storeFile = new File(filesDir, FILE_NAME);
    }

    /** Nacita ulozenu totoznost, alebo vyrobi novu. */
    public static synchronized KeyStore keyStore() throws Exception {
        if (cached != null) {
            return cached;
        }
        if (storeFile == null) {
            throw new IllegalStateException("AtvCrypto.init sa este nezavolalo");
        }
        KeyStore ks = KeyStore.getInstance("PKCS12");
        if (storeFile.exists()) {
            try (FileInputStream in = new FileInputStream(storeFile)) {
                ks.load(in, PASSWORD);
            }
        } else {
            ks.load(null, PASSWORD);
            SelfSigned.Identity identity = SelfSigned.create("atvremote", 25);
            ks.setKeyEntry(ALIAS, identity.privateKey, PASSWORD,
                    new Certificate[] {identity.certificate});
            try (FileOutputStream out = new FileOutputStream(storeFile)) {
                ks.store(out, PASSWORD);
            }
        }
        cached = ks;
        return ks;
    }

    public static X509Certificate clientCertificate() throws Exception {
        return (X509Certificate) keyStore().getCertificate(ALIAS);
    }

    /**
     * TLS spojenie s certifikatom klienta.
     *
     * Certifikat boxu sa zamerne neoveruje proti certifikacnym autoritam —
     * je samopodpisany. Jeho pravost potvrdi az parovaci kod z obrazovky,
     * ktory vstupuje do spolocneho odtlacku oboch verejnych klucov.
     */
    public static SSLSocket connect(String host, int port, int timeoutMs) throws Exception {
        SSLSocket socket = (SSLSocket) context().getSocketFactory().createSocket();
        socket.connect(new InetSocketAddress(host, port), timeoutMs);
        socket.setSoTimeout(timeoutMs);
        socket.startHandshake();
        return socket;
    }

    /** SSLContext s nasim certifikatom; pouziva ho aj test. */
    public static SSLContext context() throws Exception {
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore(), PASSWORD);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), new TrustManager[] {ACCEPT_ANY_SERVER}, null);
        return ctx;
    }

    public static RSAPublicKey rsaKey(X509Certificate cert) {
        return (RSAPublicKey) cert.getPublicKey();
    }

    /** Cislo ako bajty bez vodiacej nuly (Java ju pridava, protokol ju necaka). */
    public static byte[] toBytes(BigInteger value) {
        byte[] raw = value.toByteArray();
        if (raw.length > 1 && raw[0] == 0) {
            byte[] trimmed = new byte[raw.length - 1];
            System.arraycopy(raw, 1, trimmed, 0, trimmed.length);
            return trimmed;
        }
        return raw;
    }

    private static final X509TrustManager ACCEPT_ANY_SERVER = new X509TrustManager() {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    };
}
