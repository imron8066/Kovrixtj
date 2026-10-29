#!/bin/sh
# Сборка для Google Play: AAB, подписанный ключом загрузки (-Pplay), и
# STORE = 'play' в src/shared/build.ts — обновления ведут в Play Маркет,
# а не в Telegram-бота. После сборки build.ts возвращается как был.
# Запуск: npm run play → builds/play/Kovrix.aab
set -e
cd "$(dirname "$0")/.."
BUILD=src/shared/build.ts
cp "$BUILD" "$BUILD.bak"
trap 'mv "$BUILD.bak" "$BUILD"' EXIT
sed -i '' "s/^export const STORE = '' as/export const STORE = 'play' as/" "$BUILD"
grep -q "STORE = 'play'" "$BUILD"
(cd android && ./gradlew bundleUserRelease -Pplay)
mkdir -p builds/play
cp android/app/build/outputs/bundle/userRelease/app-user-release.aab builds/play/Kovrix.aab
echo "Готово: builds/play/Kovrix.aab"
