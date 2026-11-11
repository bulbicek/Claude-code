#!/usr/bin/env bash
# Zostaví TornadoIdle.apk z ../index.html bez Gradle (aapt2 + javac + d8 + zipalign + apksigner).
# Potrebuje: JDK 11+, Android build-tools a platformu. Cesty sa dajú zmeniť premennými BUILD_TOOLS a ANDROID_JAR.
set -euo pipefail
cd "$(dirname "$0")"
BT="${BUILD_TOOLS:?nastav BUILD_TOOLS na priečinok Android build-tools (aapt2, d8, zipalign, apksigner)}"
JAR="${ANDROID_JAR:?nastav ANDROID_JAR na platforms/android-34/android.jar}"
KS="${KEYSTORE:-sideload.keystore}"
VERSION_CODE="${VERSION_CODE:-1}"; VERSION_NAME="${VERSION_NAME:-1.0}"
OUT=build; rm -rf "$OUT"; mkdir -p "$OUT/assets" "$OUT/classes" "$OUT/dex"
cp ../index.html "$OUT/assets/index.html"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/app.unsigned.apk" -I "$JAR" --manifest AndroidManifest.xml -A "$OUT/assets" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"
javac -nowarn --release 11 -cp "$JAR" -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --release --lib "$JAR" --min-api 24 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q -j ../app.unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
if [ ! -f "$KS" ]; then   # kľúč na podpis pre priamu inštaláciu (nie pre obchod Play)
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias tornado -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Tornado Idle sideload" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias tornado --out TornadoIdle.apk "$OUT/app.aligned.apk"
"$BT/apksigner" verify --print-certs TornadoIdle.apk | head -3
ls -la TornadoIdle.apk
