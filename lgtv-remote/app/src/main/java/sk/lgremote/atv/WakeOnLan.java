package sk.lgremote.atv;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;

/**
 * Prebudenie zariadenia cez siet (Wake-on-LAN).
 *
 * Uspane zariadenie uz neprijima bezne spojenia, ale jeho sietova karta
 * stale pocuva. Caka na "kuzelny paket": sest bajtov 0xFF a za nimi
 * sestnastkrat zopakovana MAC adresa. Posiela sa vysielanim na celu
 * siet, lebo uspane zariadenie uz nema svoju adresu.
 */
public final class WakeOnLan {

    /** Porty, na ktorych sa kuzelny paket bezne ocakava. */
    private static final int[] PORTS = {9, 7};

    private WakeOnLan() {}

    /** Zlozi kuzelny paket pre danu MAC adresu. */
    public static byte[] magicPacket(String mac) {
        byte[] address = parseMac(mac);
        byte[] packet = new byte[6 + 16 * 6];
        for (int i = 0; i < 6; i++) {
            packet[i] = (byte) 0xFF;
        }
        for (int i = 6; i < packet.length; i += 6) {
            System.arraycopy(address, 0, packet, i, 6);
        }
        return packet;
    }

    /** Prijme MAC s dvojbodkami, pomlckami aj bez oddelovacov. */
    public static byte[] parseMac(String mac) {
        if (mac == null) {
            throw new IllegalArgumentException("MAC adresa chýba");
        }
        String clean = mac.trim().replaceAll("[:\\-.\\s]", "");
        if (clean.length() != 12) {
            throw new IllegalArgumentException("MAC adresa má mať 12 znakov, nie "
                    + clean.length());
        }
        byte[] out = new byte[6];
        for (int i = 0; i < 6; i++) {
            try {
                out[i] = (byte) Integer.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("MAC adresa nie je šestnástková");
            }
        }
        return out;
    }

    /**
     * Kam paket poslat. Uspane zariadenie nema vlastnu adresu, takze
     * sa vysiela na celu siet; posledna znama adresa sa skusi tiez,
     * ak si ju smerovac este pamata.
     */
    public static List<String> targets(String lastKnownIp) {
        List<String> list = new ArrayList<>();
        list.add("255.255.255.255");
        if (lastKnownIp != null && lastKnownIp.indexOf('.') > 0) {
            int lastDot = lastKnownIp.lastIndexOf('.');
            list.add(lastKnownIp.substring(0, lastDot) + ".255");
            list.add(lastKnownIp);
        }
        return list;
    }

    /** Posle paket. Musi bezat mimo vlakna, ktore kresli obrazovku. */
    public static void send(String mac, String lastKnownIp) throws Exception {
        byte[] packet = magicPacket(mac);
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            for (String target : targets(lastKnownIp)) {
                for (int port : PORTS) {
                    try {
                        socket.send(new DatagramPacket(packet, packet.length,
                                InetAddress.getByName(target), port));
                    } catch (Exception ignored) {
                        // jedna adresa moze byt nedostupna, skusame dalsiu
                    }
                }
            }
        }
    }
}
