#!/bin/bash
# Админ-приложение «KovriX A» на iOS-симуляторе: npm run ios:admin
# Тот же проект Xcode, что и у клиента, но другой модуль (DonixAdmin),
# bundle id com.donix.admin и иконка с «A» — ставится рядом с Kovrix.
# Первым аргументом можно передать имя симулятора: npm run ios:admin -- "iPhone 15"
set -e
cd "$(dirname "$0")/.."

# без аргумента — тот же телефон, что у npm run ios (scripts/ios-sim.sh)
NAME="${1:-iPhone 16 Pro Max}"
[ -z "$1" ] && bash scripts/ios-sim.sh
SIM=$(xcrun simctl list devices available | grep -m1 -F "$NAME (" | grep -oE '[0-9A-F-]{36}')
if [ -z "$SIM" ]; then
  SIM=$(xcrun simctl list devices available | grep -m1 -E 'iPhone' | grep -oE '\(([0-9A-F-]{36})\)' | tr -d '()')
fi
xcrun simctl boot "$SIM" 2>/dev/null || true
open -a Simulator

# Metro нужен для Debug-сборки
if ! lsof -i :8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Запускаю Metro (лог: metro.log)…"
  nohup npx react-native start > metro.log 2>&1 &
fi

xcodebuild -workspace ios/Donix.xcworkspace -scheme Donix -configuration Debug \
  -sdk iphonesimulator -destination "id=$(xcrun simctl list devices | grep -m1 "$SIM" | grep -oE '[0-9A-F-]{36}')" \
  -derivedDataPath ios/build -quiet -jobs 4 ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO \
  RN_MODULE=DonixAdmin APP_DISPLAY_NAME="KovriX A" DONIX_ID_SUFFIX=.admin DONIX_APPICON=AppIconAdmin

APP=ios/build/Build/Products/Debug-iphonesimulator/Donix.app
xcrun simctl install "$SIM" "$APP"
xcrun simctl launch "$SIM" com.donix.admin
echo "Готово: KovriX A запущено на симуляторе."
