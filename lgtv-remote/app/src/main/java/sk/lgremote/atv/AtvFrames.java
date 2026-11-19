package sk.lgremote.atv;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Citanie a zapis sprav, ktore su oddelene varint dlzkou. */
final class AtvFrames {

    private AtvFrames() {}

    static byte[] read(InputStream in) throws IOException {
        long length = readVarint(in);
        if (length < 0 || length > 1024 * 1024) {
            throw new IOException("nezmyselna dlzka spravy: " + length);
        }
        byte[] body = new byte[(int) length];
        int read = 0;
        while (read < body.length) {
            int n = in.read(body, read, body.length - read);
            if (n < 0) {
                throw new IOException("spojenie sa zatvorilo uprostred spravy");
            }
            read += n;
        }
        return body;
    }

    private static long readVarint(InputStream in) throws IOException {
        long result = 0;
        int shift = 0;
        while (true) {
            int b = in.read();
            if (b < 0) {
                throw new IOException("spojenie sa zatvorilo");
            }
            result |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                return result;
            }
            shift += 7;
            if (shift > 63) {
                throw new IOException("varint je prilis dlhy");
            }
        }
    }

    static synchronized void write(OutputStream out, Proto.Writer msg) throws IOException {
        out.write(msg.toFramed());
        out.flush();
    }
}
