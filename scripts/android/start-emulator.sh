#!/usr/bin/env bash
# Starts a headless Android emulator with a recent Chromium, and opens a page
# of the dev server in it, setting up what's missing on the way. See README.md.
set -euo pipefail

: "${ANDROID_HOME:=$HOME/Android/Sdk}"
AVD_NAME="${AVD_NAME:-slider}"
# The API 37 image crashes in SurfaceFlinger with emulator 37.2.
SYSTEM_IMAGE="${SYSTEM_IMAGE:-system-images;android-36;google_apis;x86_64}"
SNAPSHOTS=https://commondatastorage.googleapis.com/chromium-browser-snapshots
# A build with element-scoped view transitions, which came in Chrome 147.
CHROMIUM_REVISION="${CHROMIUM_REVISION:-1722657}"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/slider-android"
PORT="${PORT:-5173}"
URL="${1:-http://localhost:$PORT/}"

sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
avdmanager="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
emulator="$ANDROID_HOME/emulator/emulator"
adb="$ANDROID_HOME/platform-tools/adb"

{ yes || true; } | "$sdkmanager" --install emulator platform-tools "$SYSTEM_IMAGE" >/dev/null

if ! "$emulator" -list-avds | grep -qx "$AVD_NAME"; then
  echo no | "$avdmanager" create avd -n "$AVD_NAME" -k "$SYSTEM_IMAGE" \
    -d pixel_6 >/dev/null
  # The defaults of older command-line tools leave no room for Chromium.
  sed -i 's/^disk.dataPartition.size=.*/disk.dataPartition.size=6G/;
    s/^hw.ramSize=.*/hw.ramSize=4096M/' \
    "$HOME/.android/avd/$AVD_NAME.avd/config.ini"
fi

apk="$CACHE_DIR/$CHROMIUM_REVISION/ChromePublic.apk"
if [[ ! -f $apk ]]; then
  mkdir -p "$CACHE_DIR/$CHROMIUM_REVISION"
  zip="$CACHE_DIR/$CHROMIUM_REVISION/chrome-android-desktop.zip"
  curl -fL -o "$zip" \
    "$SNAPSHOTS/AndroidDesktop_x64/$CHROMIUM_REVISION/chrome-android-desktop.zip"
  unzip -j -o "$zip" '*/apks/ChromePublic.apk' -d "$(dirname "$apk")"
  rm "$zip"
fi

if ! "$adb" get-state >/dev/null 2>&1; then
  "$emulator" -avd "$AVD_NAME" -no-window -no-audio -no-snapshot \
    -no-boot-anim -gpu swangle_indirect >"$CACHE_DIR/emulator.log" 2>&1 &
  "$adb" wait-for-device
  until [[ "$("$adb" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; do
    sleep 2
  done
fi

if ! "$adb" shell pm list packages | grep -q org.chromium.chrome; then
  "$adb" install -r "$apk" >/dev/null
  # Otherwise, Chromium asks for it over the first page.
  "$adb" shell pm grant org.chromium.chrome android.permission.POST_NOTIFICATIONS
fi
# Skip the first run experience, and let DevTools connect.
"$adb" shell "echo '_ --disable-fre --no-default-browser-check \
  --no-first-run --enable-remote-debugging' > /data/local/tmp/chrome-command-line"
"$adb" shell am set-debug-app --persistent org.chromium.chrome
"$adb" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
"$adb" shell am start -n org.chromium.chrome/com.google.android.apps.chrome.Main \
  -a android.intent.action.VIEW -d "$URL" >/dev/null
echo "Opened $URL in Chromium on the emulator."
