# Tornádo Idle · METEO 24

3D idle hra v HTML. Si tornádo – ničíš mesto, za škody dostávaš peniaze a vylepšuješ vietor.
Téma UI: televízne počasie (LIVE vysielanie, radar, stupnica EF, ticker so správami).

## Hranie
Otvor `index.html` v prehliadači (funguje aj z `file://`, všetko je v jednom súbore).

- **Klik** do sveta alebo na radar – nasmeruje tornádo; inak si autopilot vyberá najvýnosnejšie ciele
- **Ťahanie** – otáčanie kamery, **koliesko / pinch** – zoom
- **Nový front** (prestíž): od 1 M škody resetuje postup za trvalý bonus ku škodám
- **Supercela** (⚡ alebo medzerník): 10 s trojnásobná sila a vyššia rýchlosť, potom 75 s nabíjanie
- **Úlohy**: krátke ciele s odmenou (ničenie budov, áut, mostov…)
- **1–6** – nákup vylepšení, **M** – zvuk, **C** alebo 🎬 – filmový vzhľad (zrno, farebné ladenie), ×1 / ×10 / MAX – množstvo nákupu
- Postup sa ukladá (localStorage) a hra zarába aj offline (vylepšenie „Nočná zmena")

- **Jazyk**: tlačidlo SK/EN v hornej lište alebo kláves **L** (slovenčina / English), voľba sa ukladá. Texty sú v `src/i18n.js`.

## Vývoj
```
npm install
npm run build   # src/main.js + src/template.html (+ three.js) -> index.html
```

## Android (APK)
Hotový balík je `android/TornadoIdle.apk` – obal s WebView, ktorý obsahuje `index.html` a beží offline.
Zostavenie bez Gradle (po `npm run build`):
```
BUILD_TOOLS=<android-sdk>/build-tools/34.0.0 ANDROID_JAR=<android-sdk>/platforms/android-34/android.jar android/build-apk.sh
```
Skript si pri prvom spustení vytvorí podpisový kľúč `android/sideload.keystore` (nie je v repozitári).
Aktualizácia sa dá nainštalovať cez staršiu verziu len vtedy, keď je podpísaná tým istým kľúčom – inak treba aplikáciu najprv odinštalovať.
