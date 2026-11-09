#!/usr/bin/env bash
# Собирает приложение для Android: bash android/build-apk.sh
# Нужны пакеты Ubuntu: android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner, а также JDK.
# Результат: dist/vtoroy-golos.apk
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
B="$ROOT/android/build"
OUT="$ROOT/dist/vtoroy-golos.apk"
# Ключ подписи в репозиторий не попадает (.gitignore). Храните его отдельно: только APK,
# подписанный тем же ключом, ставится поверх старой версии без потери дневника занятий.
# Путь и пароль можно задать переменными VG_KEYSTORE и VG_KEYSTORE_PASS.
KS="${VG_KEYSTORE:-$ROOT/android/release.keystore}"
PASS="${VG_KEYSTORE_PASS:-vtoroy-golos}"

case "$B" in */android/build) rm -rf "$B" ;; esac
mkdir -p "$B/assets/www" "$B/gen" "$B/obj" "$ROOT/dist"

python3 android/update_sw.py
cp index.html manifest.webmanifest "$B/assets/www/"
cp -r css js fonts icons "$B/assets/www/"

aapt package -f -0 arsc -M android/AndroidManifest.xml -S android/res -A "$B/assets" \
  -I "$ANDROID_JAR" -J "$B/gen" -F "$B/app.unsigned.apk"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$B/obj" \
  android/src/ru/vtoroygolos/app/*.java $(find "$B/gen" -name R.java)
dalvik-exchange --dex --output="$B/classes.dex" "$B/obj"
(cd "$B" && aapt add app.unsigned.apk classes.dex > /dev/null)
zipalign -f -p 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"

if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias vtoroygolos \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Vtoroy Golos"
fi
apksigner sign --ks "$KS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --out "$OUT" "$B/app.aligned.apk"
apksigner verify "$OUT"
echo "Готово: $OUT ($(du -h "$OUT" | cut -f1))"
