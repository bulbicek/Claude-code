# Riť versus paneláky – zálohy

Slovenská idle hra na sídlisku zo 70. rokov (WebGL / Three.js, bez obrázkových textúr).

## Obsah
- `zdroj/rit-versus-panelaky.html` – aktuálny zdroj (verzia 1.9). Na mieste `<!--THREEJS-->` sa pri zostavení vkladá Three.js r128.
- `build/index-web.html` – hotová, samostatná webová verzia (Three.js vložená, dá sa otvoriť priamo v prehliadači).
- `build/build.py`, `build/prefix.html`, `build/three.min.js` – zostavenie webovej verzie.
- `apk/` – Android APK 1.9.2 (versionCode 15) a stabilná 1.2. Podpísané kľúčom `kluc/rit-release.jks` (alias `rit`, návod v `kluc/README.md`).
- `zalohy/` – staršie verzie a medzistavy:
  - `rit-1.9.html`, `rit-1.8.html`
  - `rit-1.7.3.html` – posledná verzia pred prestížou
  - `rit-1.7.html` – režim „iba hra“, realistické oblaky
  - `rit-1.6-mapa20.html` – mapa 20×20
  - `rit-1.5.2.html` – Riť podľa nákresu, bez tváre
  - `rit-1.5.1.html` – Riť podľa nákresu, krv pri smrti
  - `rit-1.5-webgl.html` – prvá WebGL verzia
  - `pred-*.html` – stavy tesne pred väčšími zmenami
  - `rit-versus-panelaky-1.2-stabilna.html`, `rit-textury-v1.html`

## Verzie
- **1.9.2** – nové logo (SVG v štýle plagátu), karta Nová hra v Kronike, o 60 % menej hviezd na strechách, 3D vtáky.
- **1.9.1** – kompaktné rozhranie: menšie oznámenia, tabule, ovládanie a panel; ťuknutím na otvorenú záložku sa panel zbalí.
- **1.9** – Riť s fázami (pri 50 % a 25 % zúri: smradľavé oblaky, dupanie, Prdíkovia); náhodné udalosti (banány, výpadok prúdu, brigáda, búrka, prémie, invázia); susedia sedia na lavičkách, klepú koberce, hrajú sa, venčia psov; mozaiky na štítoch a občianske budovy (potraviny, škola, kino…); filmová kamera v režime iba hra; prechádzka z pohľadu hrdinu.
- **1.8** – Generálna rekonštrukcia (prestíž): od päťročnice VI zbúraš sídlisko a dostaneš vyznamenania ★ (+10 % bony, +2 % sila a zdravie navždy, viac susedov na štart). Plán rastie ×10 namiesto ×16 za päťročnicu. Riť rastie +2 % za päťročnicu a +5 % za rekonštrukciu, nepriatelia +1 %; každých 10 päťročníc jubileum s ohňostrojom, hviezdami na strechách a farebným rámom tabule. Hrdina nosí odznaky za rekonštrukcie.
- **1.7.3** – pruh života Riti je vždy pod informačnými tabuľami.
- **1.7.2** – hra siaha až po horný okraj (pod stavový riadok), bez sivých pásov.
- **1.7.1** – v režime „iba hra“ sa skryje aj horná a spodná lišta telefónu.
- **1.7** – tlačidlo s okom skryje všetko okrem hry (UI, čísla, texty, popupy); nové kopovité oblaky.
- **1.6** – mapa 20×20, viac panelákov.
- **1.5.x** – WebGL 3D svet, tiene, svietiace okná, jazdiace autá; Riť podľa nákresu, výbuch na guličky a krv; voľby hrdinu podľa fotky.
- **1.4** – 3D nepriatelia (2D canvas).
- **1.3** – 3D postavičky.
- **1.2** – stabilná verzia s paličkovými postavičkami.
- `build/android/` – smali zdroj Android aplikácie (MainActivity, Bridge), manifest a apktool.yml.
