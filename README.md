# Riť versus paneláky – zálohy

Slovenská idle hra na sídlisku zo 70. rokov (WebGL / Three.js, bez obrázkových textúr).

## Obsah
- `zdroj/rit-versus-panelaky.html` – aktuálny zdroj (verzia 1.6, mapa 20×20). Na mieste `<!--THREEJS-->` sa pri zostavení vkladá Three.js r128.
- `build/index-web.html` – hotová, samostatná webová verzia (Three.js vložená, dá sa otvoriť priamo v prehliadači).
- `build/build.py`, `build/prefix.html`, `build/three.min.js` – zostavenie webovej verzie.
- `apk/` – Android APK 1.6 (versionCode 7) a stabilná 1.2. Podpísané kľúčom `rit-release.jks` (alias `rit`); kľúč tu nie je.
- `zalohy/` – staršie verzie a medzistavy:
  - `rit-1.6-mapa20.html` – mapa 20×20
  - `rit-1.5.2.html` – Riť podľa nákresu, bez tváre
  - `rit-1.5.1.html` – Riť podľa nákresu, krv pri smrti
  - `rit-1.5-webgl.html` – prvá WebGL verzia
  - `pred-*.html` – stavy tesne pred väčšími zmenami
  - `rit-versus-panelaky-1.2-stabilna.html`, `rit-textury-v1.html`

## Verzie
- **1.6** – mapa 20×20, viac panelákov.
- **1.5.x** – WebGL 3D svet, tiene, svietiace okná, jazdiace autá; Riť podľa nákresu, výbuch na guličky a krv; voľby hrdinu podľa fotky.
- **1.4** – 3D nepriatelia (2D canvas).
- **1.3** – 3D postavičky.
- **1.2** – stabilná verzia s paličkovými postavičkami.
