package sk.lgremote.atv;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.math.BigInteger;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Calendar;
import java.util.Date;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import javax.security.auth.x500.X500Principal;

/**
 * Kluc a certifikat klienta pre spojenie s Android TV.
 *
 * Box si klienta pamata podla jeho certifikatu, takze kluc musi prezit
 * restart appky — je ulozeny v AndroidKeyStore, odkial sa da nebrat von.
 */
public final class AtvCrypto {

    private static final String ALIAS = "atv_client_key";

    private AtvCrypto() {}

    /** Vytvori kluc a samopodpisany certifikat, ak este neexistuju. */
    public static synchronized void ensureKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            return;
        }
        Calendar start = Calendar.getInstance();
        Calendar end = Calendar.getInstance();
        end.add(Calendar.YEAR, 25);

        KeyPairGenerator gen = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore");
        gen.initialize(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
                        | KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA1,
                        KeyProperties.DIGEST_NONE)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_PKCS1)
                .setCertificateSubject(new X500Principal("CN=atvremote"))
                .setCertificateSerialNumber(BigInteger.valueOf(1))
                .setCertificateNotBefore(new Date(start.getTimeInMillis()))
                .setCertificateNotAfter(new Date(end.getTimeInMillis()))
                .build());
        gen.generateKeyPair();
    }

    public static X509Certificate clientCertificate() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return (X509Certificate) ks.getCertificate(ALIAS);
    }

    /**
     * TLS spojenie s certifikatom klienta.
     *
     * Certifikat boxu sa zamerne neoveruje proti certifikacnym autoritam —
     * je samopodpisany. Jeho pravost sa potvrdi az parovacim kodom, ktory
     * televizor ukaze na obrazovke a ktory vstupuje do spolocneho odtlacku.
     */
    public static SSLSocket connect(String host, int port, int timeoutMs) throws Exception {
        ensureKey();
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, null);

        SSLContext ctx = SSLContext.getInstance("TLSv1.2");
        ctx.init(kmf.getKeyManagers(), new TrustManager[] {ACCEPT_ANY_SERVER}, null);

        SSLSocket socket = (SSLSocket) ctx.getSocketFactory().createSocket();
        socket.connect(new java.net.InetSocketAddress(host, port), timeoutMs);
        socket.setSoTimeout(timeoutMs);
        socket.startHandshake();
        return socket;
    }

    /** Odtlacok sa pocita z modulu a exponentu oboch certifikatov. */
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
