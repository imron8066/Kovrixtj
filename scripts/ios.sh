#!/bin/bash
# Kovrix на iOS-симуляторе: npm run ios
# Быстро: сборка как у клиентов (код JS внутри — Metro не нужен, открывается
# сразу), но только под процессор этого Mac — раньше Release собирался
# дважды, под x86_64 и arm64, и на 8 ГБ памяти шёл около часа. Папка сборки
# ios/build остаётся, поэтому следующий раз собирается только изменённое,
# а если ничего не менялось — сборка пропускается и запуск занимает секунды.
# Пересобрать насильно: npm run ios -- --build
# Отладка с Metro и горячей перезагрузкой: npm run ios:dev
set -e
cd "$(dirname "$0")/.."

NAME="iPhone 16 Pro Max"
bash scripts/ios-sim.sh
SIM=$(xcrun simctl list devices available | grep -m1 -F "$NAME (" | grep -oE '[0-9A-F-]{36}')

APP=ios/build/Build/Products/Release-iphonesimulator/Donix.app
STAMP=ios/build/.kovrix-user
# отпечаток всего, из чего собирается приложение: код, картинки, ios/
HASH=$( (echo user; cat ios/Podfile.lock package-lock.json index.js app.json ios/Donix.xcodeproj/project.pbxproj;
  find src ios/Donix -type f | sort | xargs shasum) | shasum | cut -d' ' -f1)

if [ "$1" != "--build" ] && [ -d "$APP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$HASH" ]; then
  echo "Ничего не менялось — сборка не нужна."
else
  echo "Сборка iOS только под $(uname -m). Первая — около 20 минут, потом 1–3 минуты…"
  rm -f "$STAMP"
  # -jobs 4: на 8 ГБ памяти восемь компиляторов сразу уводят Mac в своп
  xcodebuild -workspace ios/Donix.xcworkspace -scheme Donix -configuration Release \
    -sdk iphonesimulator -destination "id=$SIM" -derivedDataPath ios/build -quiet -jobs 4 \
    ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
  echo "$HASH" > "$STAMP"
fi

xcrun simctl install "$SIM" "$APP"
xcrun simctl launch "$SIM" com.donix
echo "Готово: Kovrix запущен на симуляторе."
