# Ovládač — diaľkové ovládanie televízora a Mi Boxu z telefónu

Android appka, ktorá ovláda televízor **priamo infračerveným vysielačom telefónu**.
Nepotrebuje WiFi, sieť ani žiadny ďalší hardvér — funguje presne tak ako originálny
ovládač, len z telefónu.

Určené pre **LG 42LW4500-ZB** (2011, Cinema 3D, bez sieťových funkcií), ale rovnaké
kódy používa väčšina LG televízorov z rokov cca 2005–2020.

## Ako to funguje

LG televízory počúvajú **NEC protokol na 38 kHz** s adresou zariadenia `4`.
Každé tlačidlo má svoje číslo (OBC), z ktorého sa dopočíta 32-bitový rámec
s prefixom `0x20DF`:

```
OBC 8  (Power)  -> 0x20DF10EF
OBC 2  (Vol +)  -> 0x20DF40BF
OBC 220 (3D)    -> 0x20DF3BC4
```

Prepočet je obyčajné otočenie poradia bitov (NEC posiela najnižší bit prvý) plus
doplnok na kontrolu. Celé je to v `IrSender.frameForObc()`, tabuľka tlačidiel
je v `LgCodes.java`.

Časovanie jedného rámca:

| časť | zapnuté | vypnuté |
|------|---------|---------|
| úvod | 9000 µs | 4500 µs |
| bit 0 | 560 µs | 560 µs |
| bit 1 | 560 µs | 1690 µs |
| záver | 560 µs | — |

Celý rámec trvá ~68 ms. Pri držaní tlačidla (hlasitosť, kanály, šípky) sa
posiela opakovane každých 160 ms.

## Čo appka vie

- Napájanie vrátane **oddeleného Zapnúť / Vypnúť** (originálny ovládač má len prepínač)
- **Priame prepnutie na HDMI 1/2/3** a AV — na originálnom ovládači sa to dá len prechádzaním zoznamu
- Hlasitosť, stíšenie, kanály, číslice, obľúbené
- Smerový kríž s OK, Menu, Q.Menu, Naspäť, Exit, Info, Program
- Pomer strán, AV režim, 3D, Simplink, Teletext, Časovač
- Farebné tlačidlá a ovládanie prehrávania
- **Skener kódov** — prechádza čísla tlačidiel 0–255 alebo pošle ľubovoľný hex rámec

## Overenie kódov

Tabuľka pochádza z [irdb](https://github.com/probonopd/irdb) (`codes/LG/TV/4,-1.csv`).
Prepočet OBC → hex bol overený proti ôsmim nezávisle známym hodnotám (Power, Vol±,
Mute, Ch±, Input, 3D) — všetky sedia na bit presne.

Kód pre **3D** pochádza z tabuľky pre novší model (55UH8509), takže na LW4500 nie je
overený. Ak nefunguje, nájdi ho skenerom a uprav `LgCodes.THREE_D`.

## Build

```bash
export ANDROID_HOME=/cesta/k/android-sdk
gradle assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Testy

```bash
gradle testDebugUnitTest
```

Overujú, že sa obe obrazovky vytvoria bez pádu (Robolectric), že prepočet OBC
na rámec sedí s ôsmimi známymi LG kódmi, že všetkých 256 možných rámcov je
platných NEC a že časovací vzor má správny tvar a dĺžku.

## Inštalácia

Appka je podpísaná debug kľúčom, takže pri inštalácii treba povoliť
„inštaláciu z neznámych zdrojov". Stiahni APK do telefónu a otvor ho.

## Požiadavky

- Android 5.0+
- Telefón s IR blasterom (Xiaomi, Redmi, Poco, staršie Huawei a Samsung)
- Povolenie `TRANSMIT_IR` — udeľuje sa automaticky, nič netreba potvrdzovať

## ANTIK Mini 2 STB — prečo zatiaľ chýba

Tretí ovládač (ANTIK Mini 2, model AWS 2651, ovládač RC211) je odložený.

Čo je overené:

- Ovládač **je infračervený** (overené cez kameru telefónu).
- Jeho kódy **nie sú v žiadnej verejnej databáze**. Prehľadané boli celé
  [Flipper-IRDB](https://github.com/UberGuidoZ/Flipper-IRDB) aj
  [irdb](https://github.com/probonopd/irdb) — značka ANTIK v nich nie je.
- Kódy sa **nedajú prebrať od príbuzných boxov**. Mini 2 stojí na čipe
  STMicroelectronics STiH207, ale boxy s podobným hardvérom používajú každý
  niečo iné: MAG protokol RC5, Humax a Thomson NEC s inou adresou,
  Arcadyan dokonca nosnú 56 kHz namiesto 38 kHz.
- **Telefón kódy odčítať nevie** — IR blaster dokáže len vysielať.

Ako to dokončiť, keď na to príde čas:

1. **Odchytiť signál** IR prijímačom (TSOP38238) na Arduino/ESP32/Raspberry Pi.
   Dá presný protokol, adresu aj kódy všetkých tlačidiel. Istá cesta.
2. **Slepé hľadanie** z appky. RC5 má malý priestor (32 adries × 64 príkazov,
   asi štyri minúty), NEC je ale 65 536 kombinácií. Neistý výsledok —
   ak box používa iný protokol alebo inú nosnú, nenájde sa nič.
