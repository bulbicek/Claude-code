package sk.lgremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import sk.lgremote.atv.AtvCrypto;
import sk.lgremote.atv.SelfSigned;

/**
 * Overuje totoznost klienta naozajstnym TLS spojenim, kde druha strana
 * certifikat klienta vyzaduje — teda presne v situacii, v akej to zlyhalo
 * pri spojeni s boxom.
 */
public class AtvCryptoTest {

    @BeforeClass
    public static void pripravUlozisko() throws Exception {
        File dir = Files.createTempDirectory("atv-test").toFile();
        dir.deleteOnExit();
        AtvCrypto.init(dir);
    }

    @Test
    public void certifikatSaDaVyrobitAPrecitat() throws Exception {
        X509Certificate cert = AtvCrypto.clientCertificate();
        assertNotNull("certifikat sa nevytvoril", cert);
        assertTrue("chyba nazov v certifikate",
                cert.getSubjectX500Principal().getName().contains("atvremote"));
        assertEquals("RSA", cert.getPublicKey().getAlgorithm());
        assertEquals(2048, AtvCrypto.rsaKey(cert).getModulus().bitLength());
        cert.checkValidity();
        // Platnost musi siahat do buducnosti, nie sa prepisat do minuleho
        // storocia kvoli dvojcifernemu roku v UTCTime.
        assertTrue("certifikat nema platnost v buducnosti: " + cert.getNotAfter(),
                cert.getNotAfter().getTime() > System.currentTimeMillis()
                        + 10L * 365 * 24 * 60 * 60 * 1000);
    }

    @Test
    public void totoznostPrezijeRestart() throws Exception {
        X509Certificate first = AtvCrypto.clientCertificate();
        X509Certificate second = AtvCrypto.clientCertificate();
        assertArrayEquals("certifikat sa medzi volaniami zmenil",
                first.getEncoded(), second.getEncoded());
    }

    /**
     * Toto je jadro testu: server vyzaduje certifikat klienta, rovnako ako
     * Android TV. Ak by klient nevedel podpisat sposobom, ktory si server
     * vypyta, handshake tu padne.
     */
    @Test
    public void tlsSpojenieSVyziadanymCertifikatomKlienta() throws Exception {
        SelfSigned.Identity server = SelfSigned.create("testbox", 1);
        KeyStore ks = KeyStore.getInstance("PKCS12");
        char[] pass = "test".toCharArray();
        ks.load(null, pass);
        ks.setKeyEntry("server", server.privateKey, pass,
                new Certificate[] {server.certificate});
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pass);
        SSLContext serverCtx = SSLContext.getInstance("TLS");
        serverCtx.init(kmf.getKeyManagers(), new TrustManager[] {ACCEPT_ANY}, null);

        SSLServerSocket listener =
                (SSLServerSocket) serverCtx.getServerSocketFactory().createServerSocket(0);
        listener.setNeedClientAuth(true);
        int port = listener.getLocalPort();

        final ArrayBlockingQueue<Object> fromServer = new ArrayBlockingQueue<>(4);
        Thread serverThread = new Thread(() -> {
            try (SSLSocket s = (SSLSocket) listener.accept()) {
                Certificate[] chain = s.getSession().getPeerCertificates();
                fromServer.put(((X509Certificate) chain[0])
                        .getSubjectX500Principal().getName());
                InputStream in = s.getInputStream();
                OutputStream out = s.getOutputStream();
                byte[] buf = new byte[5];
                int read = in.read(buf);
                out.write(buf, 0, read);
                out.flush();
                fromServer.put(s.getSession().getProtocol());
            } catch (Throwable t) {
                try {
                    fromServer.put("CHYBA: " + t);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();

        SSLSocket client = AtvCrypto.connect("127.0.0.1", port, 8000);
        byte[] payload = {1, 2, 3, 4, 5};
        client.getOutputStream().write(payload);
        client.getOutputStream().flush();
        byte[] echo = new byte[5];
        int read = client.getInputStream().read(echo);
        client.close();
        listener.close();

        Object subject = fromServer.poll(15, TimeUnit.SECONDS);
        assertNotNull("server sa neozval", subject);
        assertTrue("server nedostal nas certifikat: " + subject,
                String.valueOf(subject).contains("atvremote"));
        assertEquals(5, read);
        assertArrayEquals(payload, echo);

        Object protocol = fromServer.poll(5, TimeUnit.SECONDS);
        assertNotNull("chyba udaj o verzii TLS", protocol);
        assertTrue("necakana verzia TLS: " + protocol,
                String.valueOf(protocol).startsWith("TLS"));
    }

    private static final X509TrustManager ACCEPT_ANY = new X509TrustManager() {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    };
}
