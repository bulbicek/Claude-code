package sk.lgremote.atv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimalny protobuf. Android TV protokol pouziva len niekolko typov sprav,
 * takze namiesto celej kniznice staci zapis a citanie zakladnych polí.
 *
 * Kazde pole ma znacku (cislo pola + typ):
 *   typ 0 = varint (cisla), typ 2 = dlzkou urcene (retazce, bajty, vnorene spravy)
 */
public final class Proto {

    private Proto() {}

    // ---------- zapis ----------

    public static class Writer {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        public Writer varint(int field, long value) {
            tag(field, 0);
            writeVarint(out, value);
            return this;
        }

        public Writer string(int field, String value) {
            return bytes(field, value.getBytes(StandardCharsets.UTF_8));
        }

        public Writer bytes(int field, byte[] value) {
            tag(field, 2);
            writeVarint(out, value.length);
            out.write(value, 0, value.length);
            return this;
        }

        public Writer message(int field, Writer nested) {
            return bytes(field, nested.toByteArray());
        }

        private void tag(int field, int wireType) {
            writeVarint(out, ((long) field << 3) | wireType);
        }

        public byte[] toByteArray() {
            return out.toByteArray();
        }

        /** Sprava s varint prefixom dlzky, tak ako ju ocakava Android TV. */
        public byte[] toFramed() {
            byte[] body = toByteArray();
            ByteArrayOutputStream framed = new ByteArrayOutputStream();
            writeVarint(framed, body.length);
            framed.write(body, 0, body.length);
            return framed.toByteArray();
        }
    }

    private static void writeVarint(ByteArrayOutputStream out, long value) {
        while (true) {
            if ((value & ~0x7FL) == 0) {
                out.write((int) value);
                return;
            }
            out.write((int) ((value & 0x7F) | 0x80));
            value >>>= 7;
        }
    }

    // ---------- citanie ----------

    /** Rozlozena sprava: cislo pola -> zoznam hodnot. */
    public static class Reader {
        private final Map<Integer, List<Object>> fields = new HashMap<>();

        public Reader(byte[] data) throws IOException {
            int pos = 0;
            while (pos < data.length) {
                long[] tagRes = readVarint(data, pos);
                int tag = (int) tagRes[0];
                pos = (int) tagRes[1];
                int field = tag >>> 3;
                int wireType = tag & 7;
                Object value;
                switch (wireType) {
                    case 0: {
                        long[] v = readVarint(data, pos);
                        value = v[0];
                        pos = (int) v[1];
                        break;
                    }
                    case 2: {
                        long[] len = readVarint(data, pos);
                        pos = (int) len[1];
                        int n = (int) len[0];
                        if (pos + n > data.length) {
                            throw new IOException("sprava je skratena");
                        }
                        byte[] b = new byte[n];
                        System.arraycopy(data, pos, b, 0, n);
                        pos += n;
                        value = b;
                        break;
                    }
                    case 5:
                        pos += 4;
                        continue;
                    case 1:
                        pos += 8;
                        continue;
                    default:
                        throw new IOException("neznamy typ pola: " + wireType);
                }
                List<Object> list = fields.get(field);
                if (list == null) {
                    list = new ArrayList<>();
                    fields.put(field, list);
                }
                list.add(value);
            }
        }

        public boolean has(int field) {
            return fields.containsKey(field);
        }

        public long getVarint(int field, long fallback) {
            List<Object> list = fields.get(field);
            if (list == null || list.isEmpty() || !(list.get(0) instanceof Long)) {
                return fallback;
            }
            return (Long) list.get(0);
        }

        public byte[] getBytes(int field) {
            List<Object> list = fields.get(field);
            if (list == null || list.isEmpty() || !(list.get(0) instanceof byte[])) {
                return null;
            }
            return (byte[]) list.get(0);
        }

        public Reader getMessage(int field) throws IOException {
            byte[] b = getBytes(field);
            return b == null ? null : new Reader(b);
        }
    }

    public static long[] readVarint(byte[] data, int pos) throws IOException {
        long result = 0;
        int shift = 0;
        while (true) {
            if (pos >= data.length) {
                throw new IOException("varint je skrateny");
            }
            int b = data[pos++] & 0xFF;
            result |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                return new long[] {result, pos};
            }
            shift += 7;
            if (shift > 63) {
                throw new IOException("varint je prilis dlhy");
            }
        }
    }
}
