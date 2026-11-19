package sk.lgremote.atv;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.text.SimpleDateFormat;

/**
 * Vyrobi RSA kluc a k nemu samopodpisany certifikat.
 *
 * Android TV chce od klienta certifikat, ale je mu jedno, kto ho vydal —
 * totoznost sa potvrdzuje az parovacim kodom. Staci teda vlastny.
 *
 * Certifikat sa sklada rucne v kodovani DER, aby appka nepotrebovala
 * ziadnu kniznicu navyse.
 */
public final class SelfSigned {

    private SelfSigned() {}

    /** sha256WithRSAEncryption (1.2.840.113549.1.1.11) */
    private static final byte[] OID_SHA256_RSA = {
            0x06, 0x09, 0x2A, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xF7, 0x0D, 0x01, 0x01, 0x0B};
    /** commonName (2.5.4.3) */
    private static final byte[] OID_CN = {0x06, 0x03, 0x55, 0x04, 0x03};

    public static class Identity {
        public final PrivateKey privateKey;
        public final X509Certificate certificate;

        Identity(PrivateKey privateKey, X509Certificate certificate) {
            this.privateKey = privateKey;
            this.certificate = certificate;
        }
    }

    public static Identity create(String commonName, int years) throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();

        long now = System.currentTimeMillis();
        byte[] tbs = tbsCertificate(
                commonName,
                pair.getPublic().getEncoded(),
                new Date(now - 24L * 60 * 60 * 1000),
                new Date(now + years * 365L * 24 * 60 * 60 * 1000));

        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(pair.getPrivate());
        signer.update(tbs);
        byte[] signature = signer.sign();

        byte[] cert = sequence(concat(
                tbs,
                sequence(concat(OID_SHA256_RSA, new byte[] {0x05, 0x00})),
                bitString(signature)));

        X509Certificate x509 = (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(cert));
        return new Identity(pair.getPrivate(), x509);
    }

    private static byte[] tbsCertificate(String commonName, byte[] publicKeyInfo,
                                         Date notBefore, Date notAfter) {
        byte[] algorithm = sequence(concat(OID_SHA256_RSA, new byte[] {0x05, 0x00}));
        byte[] name = name(commonName);
        byte[] validity = sequence(concat(time(notBefore), time(notAfter)));
        return sequence(concat(
                integer(BigInteger.valueOf(System.currentTimeMillis() / 1000)),
                algorithm,
                name,
                validity,
                name,
                publicKeyInfo));
    }

    private static byte[] name(String commonName) {
        byte[] value = concat(new byte[] {0x13}, length(commonName.length()),
                commonName.getBytes(StandardCharsets.US_ASCII));
        byte[] attribute = sequence(concat(OID_CN, value));
        byte[] set = tagged(0x31, attribute);
        return sequence(set);
    }

    /**
     * Cas v certifikate.
     *
     * UTCTime ma len dvojciferny rok, takze podla normy pokryva roky
     * 1950 az 2049 — hodnota 50 znamena 1950. Pre neskorsie datumy sa
     * musi pouzit GeneralizedTime so styrmi ciframi, inak by certifikat
     * platil spatne v minulom storoci.
     */
    private static byte[] time(Date date) {
        SimpleDateFormat year = new SimpleDateFormat("yyyy", Locale.US);
        year.setTimeZone(UTC);
        boolean generalized = Integer.parseInt(year.format(date)) >= 2050;

        SimpleDateFormat fmt = new SimpleDateFormat(
                generalized ? "yyyyMMddHHmmss'Z'" : "yyMMddHHmmss'Z'", Locale.US);
        fmt.setTimeZone(UTC);
        byte[] text = fmt.format(date).getBytes(StandardCharsets.US_ASCII);
        return concat(new byte[] {(byte) (generalized ? 0x18 : 0x17)},
                length(text.length), text);
    }

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    private static byte[] integer(BigInteger value) {
        byte[] raw = value.toByteArray();
        return concat(new byte[] {0x02}, length(raw.length), raw);
    }

    private static byte[] bitString(byte[] value) {
        byte[] body = concat(new byte[] {0x00}, value);  // 0 nepouzitych bitov
        return concat(new byte[] {0x03}, length(body.length), body);
    }

    private static byte[] sequence(byte[] body) {
        return tagged(0x30, body);
    }

    private static byte[] tagged(int tag, byte[] body) {
        return concat(new byte[] {(byte) tag}, length(body.length), body);
    }

    /** Dlzka v kodovani DER: kratka forma do 127, inak pocet bajtov dlzky. */
    private static byte[] length(int value) {
        if (value < 0x80) {
            return new byte[] {(byte) value};
        }
        ByteArrayOutputStream digits = new ByteArrayOutputStream();
        int v = value;
        while (v > 0) {
            digits.write(v & 0xFF);
            v >>>= 8;
        }
        byte[] reversed = digits.toByteArray();
        byte[] out = new byte[reversed.length + 1];
        out[0] = (byte) (0x80 | reversed.length);
        for (int i = 0; i < reversed.length; i++) {
            out[out.length - 1 - i] = reversed[i];
        }
        return out;
    }

    private static byte[] concat(byte[]... parts) {
        int total = 0;
        for (byte[] part : parts) {
            total += part.length;
        }
        byte[] out = new byte[total];
        int pos = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, out, pos, part.length);
            pos += part.length;
        }
        return out;
    }
}
