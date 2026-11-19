package sk.lgremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import sk.lgremote.atv.AtvCrypto;
import sk.lgremote.atv.AtvRemote;
import sk.lgremote.atv.Proto;
import sk.lgremote.atv.SelfSigned;

/**
 * Falosny box: server, ktory sa sprava ako Android TV.
 *
 * Prejde celu relaciu — predstavi sa, vypyta si nastavenie, ohlasi
 * pripravenost, posle ping a nakoniec prijme stlacenie tlacidla.
 * Ramcovanie sprav si test pocita vlastnym kodom, takze overuje
 * zapis appky a nie sam seba.
 */
public class FakeBoxTest {

    @BeforeClass
    public static void pripravUlozisko() throws Exception {
        File dir = Files.createTempDirectory("fakebox").toFile();
        dir.deleteOnExit();
        AtvCrypto.init(dir);
    }

    @Test
    public void celaRelaciaAzPoStlacenieTlacidla() throws Exception {
        SelfSigned.Identity boxIdentity = SelfSigned.create("MiBox", 1);
        KeyStore ks = KeyStore.getInstance("PKCS12");
        char[] pass = "test".toCharArray();
        ks.load(null, pass);
        ks.setKeyEntry("box", boxIdentity.privateKey, pass,
                new Certificate[] {boxIdentity.certificate});
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(
                KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pass);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), new TrustManager[] {ACCEPT_ANY}, null);

        SSLServerSocket listener =
                (SSLServerSocket) ctx.getServerSocketFactory().createServerSocket(0);
        listener.setNeedClientAuth(true);
        int port = listener.getLocalPort();

        final ArrayBlockingQueue<String> udalosti = new ArrayBlockingQueue<>(16);
        Thread box = new Thread(() -> {
            try (SSLSocket s = (SSLSocket) listener.accept()) {
                InputStream in = s.getInputStream();
                OutputStream out = s.getOutputStream();

                // 1. box sa predstavi
                Proto.Writer info = new Proto.Writer()
                        .string(1, "MiTV-TEST")
                        .string(2, "Xiaomi");
                write(out, new Proto.Writer().message(1,
                        new Proto.Writer().varint(1, 611).message(2, info)));
                Proto.Reader reply = new Proto.Reader(read(in));
                udalosti.put(reply.has(1) ? "nastavenie" : "necakana odpoved");

                // 2. box si vypyta zapnutie
                write(out, new Proto.Writer().message(2,
                        new Proto.Writer().varint(1, 611)));
                reply = new Proto.Reader(read(in));
                udalosti.put(reply.has(2) ? "zapnutie" : "necakana odpoved");

                // 3. box ohlasi pripravenost
                write(out, new Proto.Writer().message(40,
                        new Proto.Writer().varint(1, 1)));

                // 4. box sa spyta, ci je appka naZive
                write(out, new Proto.Writer().message(8,
                        new Proto.Writer().varint(1, 42).varint(2, 1)));
                reply = new Proto.Reader(read(in));
                Proto.Reader pong = reply.getMessage(9);
                udalosti.put(pong != null && pong.getVarint(1, -1) == 42
                        ? "pong 42" : "zla odpoved na ping");

                // 5. stlacenie tlacidla
                reply = new Proto.Reader(read(in));
                Proto.Reader inject = reply.getMessage(10);
                udalosti.put(inject == null ? "chyba stlacenie"
                        : "tlacidlo " + inject.getVarint(1, -1)
                          + " smer " + inject.getVarint(2, -1));
            } catch (Throwable t) {
                try {
                    udalosti.put("CHYBA: " + t);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        box.setDaemon(true);
        box.start();

        final CountDownLatch pripravene = new CountDownLatch(1);
        final StringBuilder nazov = new StringBuilder();
        final StringBuilder priebeh = new StringBuilder();
        AtvRemote remote = new AtvRemote("127.0.0.1", port, new AtvRemote.Listener() {
            @Override public void onLog(String line) {
                priebeh.append("\n  ").append(line);
            }
            @Override public void onReady(String deviceName) {
                nazov.append(deviceName);
                pripravene.countDown();
            }
            @Override public void onClosed(String reason) {
                priebeh.append("\n  zatvorene: ").append(reason);
            }
        });
        remote.connect();

        assertTrue("box neohlasil pripravenost. Priebeh:" + priebeh
                        + "\n  udalosti: " + udalosti,
                pripravene.await(20, TimeUnit.SECONDS));
        assertEquals("nastavenie", udalosti.poll(5, TimeUnit.SECONDS));
        assertEquals("zapnutie", udalosti.poll(5, TimeUnit.SECONDS));
        assertEquals("pong 42", udalosti.poll(5, TimeUnit.SECONDS));

        assertTrue("tlacidlo sa neodoslalo", remote.sendKey(23));
        assertEquals("tlacidlo 23 smer 3", udalosti.poll(5, TimeUnit.SECONDS));

        // Zapis nesmie prebehnut na vlakne volajuceho — Android by to odmietol.
        assertNotNull("nevieme, na ktorom vlakne sa zapisovalo", remote.lastWriteThread());
        assertEquals("atv-sender", remote.lastWriteThread());

        remote.shutdown();
        listener.close();
    }

    // ---------- vlastne ramcovanie, nezavisle od appky ----------

    private static void write(OutputStream out, Proto.Writer msg) throws IOException {
        byte[] body = msg.toByteArray();
        ByteArrayOutputStream framed = new ByteArrayOutputStream();
        int len = body.length;
        while (true) {
            if ((len & ~0x7F) == 0) {
                framed.write(len);
                break;
            }
            framed.write((len & 0x7F) | 0x80);
            len >>>= 7;
        }
        framed.write(body, 0, body.length);
        out.write(framed.toByteArray());
        out.flush();
    }

    private static byte[] read(InputStream in) throws IOException {
        int length = 0;
        int shift = 0;
        while (true) {
            int b = in.read();
            if (b < 0) {
                throw new IOException("spojenie sa zatvorilo");
            }
            length |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                break;
            }
            shift += 7;
        }
        byte[] body = new byte[length];
        int read = 0;
        while (read < length) {
            int n = in.read(body, read, length - read);
            if (n < 0) {
                throw new IOException("sprava je skratena");
            }
            read += n;
        }
        return body;
    }

    private static final X509TrustManager ACCEPT_ANY = new X509TrustManager() {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    };
}
