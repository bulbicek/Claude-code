# PolitPexeso 🃏🇸🇰

Android pexeso s tvárami 20 slovenských politikov. Nezávislá zábavná aplikácia, nie je spojená so žiadnou stranou ani kandidátom a nijako politikov nehodnotí.

## Herné módy
- **Klasik** – bez limitu, bodovanie za čas, ťahy a sériu zhôd
- **Na čas** – odpočet, každá zhoda pridá 3 s
- **Na ťahy** – obmedzený počet pokusov
- **Duel** – 2–4 hráči na jednom telefóne
- **Spoznaj politika** – kvíz „kto je na fotke?“ (10 otázok, časový limit, séria)

Ďalej: 4 obtiažnosti (6 až 15 párov), typ párov *fotka–fotka* alebo *fotka–meno*, 3D otáčanie kariet, náhľad kariet na začiatku, rekordy, konfety.

## Fotky
Fotky sa **nenachádzajú v repozitári**. Skript `tools/fetch_photos.py` ich stiahne z Wikimedia Commons (článok politika na sk/en Wikipédii → hlavný obrázok), prijme **iba slobodné licencie** (CC / verejná doména) a uloží autorov do `credits.json`, ktorý zobrazuje obrazovka *Zdroje fotiek* (CC BY-SA vyžaduje uvedenie autora). Politik bez slobodnej fotky dostane náhradný portrét s iniciálami.

Zoznam politikov je v `app/src/main/assets/politicians/roster.json` (jediný zdroj pravdy pre appku aj skript).

## Zostavenie APK
**Cez GitHub Actions:** workflow `.github/workflows/android.yml` stiahne fotky, spustí testy a vyrobí `app-debug.apk` (artefakt behu).

**Lokálne** (JDK 17 + Android SDK):
```bash
python3 tools/fetch_photos.py
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest    # testy herného enginu
```

## Štruktúra
- `engine/Engine.kt` – čistá herná logika (rozdanie, otáčanie, vyhodnotenie, bodovanie), pokrytá testami
- `ui/` – Jetpack Compose obrazovky, karty s animáciou, konfety
- `Data.kt` – načítanie politikov/fotiek/licencií, ukladanie rekordov
