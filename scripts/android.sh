#!/bin/bash
# Kovrix на Android: npm run android (KovriX A: npm run android -- admin)
# Быстрая сборка как у клиентов (release, код JS внутри — Metro не нужен,
# открывается сразу), только под процессор подключённого телефона или
# эмулятора. Нет устройства — запускается эмулятор Pixel_4_API_30.
# Отладка с Metro и горячей перезагрузкой: npm run android:dev
set -e
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK/platform-tools/adb"
FLAVOR="${1:-user}"
APP_ID=com.donix
[ "$FLAVOR" = admin ] && APP_ID=com.donix.admin

if ! "$ADB" devices | grep -qw device; then
  echo "Нет телефона — запускаю эмулятор…"
  nohup "$SDK/emulator/emulator" -avd Pixel_4_API_30 -no-snapshot-save -no-audio >/dev/null 2>&1 &
  "$ADB" wait-for-device
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
fi
ABI=$("$ADB" shell getprop ro.product.cpu.abi | tr -d '\r')
TASK=assembleUserRelease
[ "$FLAVOR" = admin ] && TASK=assembleAdminRelease
echo "Сборка $FLAVOR под $ABI…"
(cd android && ./gradlew "$TASK" -PreactNativeArchitectures="$ABI" -q)
APK="android/app/build/outputs/apk/$FLAVOR/release/app-$FLAVOR-release.apk"
"$ADB" install -r "$APK" || {
  echo "Старая версия с другой подписью — удаляю и ставлю заново (вход на этом устройстве придётся повторить)"
  "$ADB" uninstall "$APP_ID" >/dev/null
  "$ADB" install "$APK"
}
# заблокированный экран не даёт открыть приложение — будим и снимаем блокировку
"$ADB" shell input keyevent KEYCODE_WAKEUP
"$ADB" shell wm dismiss-keyguard 2>/dev/null || true
"$ADB" shell input keyevent 82
# сразу после установки Android ещё может не знать приложение — пробуем ещё
for _ in 1 2 3 4 5; do
  "$ADB" shell am start -W -n "$APP_ID/com.donix.MainActivity" 2>&1 | grep -q "Error" || break
  sleep 2
done
if "$ADB" shell dumpsys activity activities | grep -q "$APP_ID/"; then
  echo "Готово: приложение открыто."
else
  echo "Приложение установлено. Если на экране пароль блокировки — разблокируйте телефон и откройте Kovrix."
fi
