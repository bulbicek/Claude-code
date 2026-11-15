# Mestopolis – Android aplikácia

Natívny obal (WebView) pre hru z priečinka `../mestopolis`. Súbory hry sa pri zostavení skopírujú do APK,
takže aplikácia funguje bez internetu.

- Zostavenie: `./gradlew assembleRelease` (potrebuje Android SDK a JDK 17)
- Automaticky: workflow `.github/workflows/mestopolis-apk.yml` zostaví APK pri každej zmene hry
  a zverejní ho na stiahnutie ako release `mestopolis-apk`:
  https://github.com/bulbicek/Claude-code/releases/download/mestopolis-apk/Mestopolis.apk
- APK je podpísané kľúčom `keystore/mestopolis.jks` (heslo `mestopolis`), aby sa nové verzie
  dali nainštalovať ako aktualizácia. Ide o hobby projekt mimo Obchodu Play, preto je kľúč v repozitári.
