# Infrared control from an Android phone

## Transmitting

`ConsumerIrManager` is all that is needed — no library, no dependency.

```java
ConsumerIrManager ir = (ConsumerIrManager) ctx.getSystemService(Context.CONSUMER_IR_SERVICE);
boolean usable = ir != null && ir.hasIrEmitter();
ir.transmit(38000, pattern);   // pattern is in microseconds, alternating on/off, starting ON
```

Manifest:

```xml
<uses-permission android:name="android.permission.TRANSMIT_IR" />
<uses-feature android:name="android.hardware.consumerir" android:required="false" />
```

`required="false"` keeps the app installable on phones without an emitter — useful when
the app also has network-controlled pages. Check `hasIrEmitter()` and say so in the UI
rather than failing silently. The permission is granted automatically; nothing to prompt for.

The emitter sits at the **top edge** of the phone, not the back. Users point the back of
the phone at the TV and conclude the app is broken, so say this in the interface.

## NEC encoding

Most TVs and many set-top boxes use NEC at a 38 kHz carrier.

| Part | ON (µs) | OFF (µs) |
|---|---|---|
| Lead-in | 9000 | 4500 |
| Bit 0 | 560 | 560 |
| Bit 1 | 560 | 1690 |
| Trailer | 560 | — |

A frame is 32 bits, most-significant bit of the word first, so the pattern array has
`2 + 64 + 1 = 67` entries and lasts about 68 ms.

```java
int[] pattern = new int[67];
pattern[0] = 9000; pattern[1] = 4500;
int i = 2;
for (int bit = 31; bit >= 0; bit--) {
    pattern[i++] = 560;
    pattern[i++] = ((frame >> bit) & 1L) == 1L ? 1690 : 560;
}
pattern[i] = 560;
```

Holding a key (volume, channel, arrows) means re-sending the whole frame about every
160 ms after an initial delay of ~400 ms. Full frames work fine; the dedicated NEC
repeat frame is not needed.

## From button number to frame

Code databases list a protocol, a device (address) and an OBC (button number). NEC
transmits each byte least-significant-bit first, so the 32-bit word is built from
**bit-reversed** bytes:

```
word = rev8(address) << 24 | rev8(~address) << 16 | rev8(obc) << 8 | rev8(~obc)
```

Verify any implementation against known values before trusting it:

| Device | OBC | Expected word |
|---|---|---|
| LG, power | 8 | `0x20DF10EF` |
| LG, volume up | 2 | `0x20DF40BF` |
| LG, volume down | 3 | `0x20DFC03F` |
| LG, mute | 9 | `0x20DF906F` |
| LG, channel up | 0 | `0x20DF00FF` |
| LG, input | 11 | `0x20DFD02F` |

A frame is well-formed only if the second byte is the complement of the first and the
fourth is the complement of the third. Checking that across all 256 button numbers is a
cheap unit test that catches encoding mistakes immediately.

## LG televisions

LG has used **NEC1, device 4** (prefix `0x20DF`) for decades, from 2005-era sets through
webOS. Verified button numbers:

| Function | OBC | Function | OBC |
|---|---|---|---|
| Power toggle | 8 | Menu / Home | 67 |
| Power **on** | 196 | Quick menu | 69 |
| Power **off** | 197 | Back / Return | 40 |
| Volume + / − | 2 / 3 | Exit | 91 |
| Mute | 9 | Info | 170 |
| Channel + / − | 0 / 1 | Guide | 169 |
| Up / Down | 64 / 65 | Aspect ratio | 121 |
| Left / Right | 7 / 6 | AV mode | 48 |
| OK | 68 | Simplink | 126 |
| Digits 0–9 | 16–25 | Sleep timer | 14 |
| Input | 11 | Teletext | 32 |
| HDMI 1 / 2 / 3 / 4 | 206 / 204 / 233 / 218 | AV | 90 |
| Red / Green / Yellow / Blue | 114 / 113 / 99 / 97 | Favourites | 30 |

Two of these are worth highlighting to users because the original remote lacks them:
**discrete power on and off** (no more guessing what state a toggle left the TV in), and
**direct HDMI selection** instead of cycling an input list.

3D on LG 3D sets is OBC 220 (`0x20DF3BC4`); this comes from a newer model's table and is
not verified on 2011 hardware.

## Finding codes for other brands

Two databases are worth searching:

- `https://github.com/probonopd/irdb` — CSV per brand and device type, with protocol,
  device, subdevice and function columns. Convert as above.
- `https://github.com/UberGuidoZ/Flipper-IRDB` — community dumps in `.ir` files, either
  `type: parsed` (protocol, address, command — convert as above) or `type: raw` (a
  microsecond timing list that can be passed to `transmit()` almost directly, but check
  the file's `frequency:` field, which is not always 38 kHz).

**Clone them; do not guess file paths.** Blind path probing wastes turns and produces
false negatives. In sandboxes `codeload.github.com` may be blocked (403) while
`git clone` over HTTPS works, and raw file fetches work too.

Beware of assuming a brand inherits codes from the chipset vendor or a similar box.
Devices with near-identical hardware diverge completely: one IPTV box family uses RC5,
another NEC with a different address, another a 56 kHz carrier.

## When a brand is in no database

This happens with regional and operator-supplied boxes. The options, in order of
certainty:

1. **Capture the real signal** — an IR receiver module (TSOP38238, under €2) on an
   Arduino, ESP32 or Raspberry Pi gives the protocol, address and every button exactly.
   This always works and takes minutes once the parts exist.
2. **Ask the manufacturer** — regional vendors sometimes simply hand over the code table.
3. **Brute-force sweep from the app** — feasible only for small code spaces. RC5 has
   32 addresses × 64 commands and can be swept in minutes; NEC's 65 536 combinations
   mean roughly half an hour of the user watching the device, with no guarantee, and it
   fails entirely if the device uses an undetected protocol or carrier.

A **code scanner** in the app pays for itself either way: let the user step through
button numbers for a known address, or send an arbitrary 32-bit frame as hex. Unverified
codes (like the 3D button above) then become a one-minute search instead of a rebuild.
