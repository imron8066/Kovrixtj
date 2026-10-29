#!/bin/bash
# Телефон для npm run ios и npm run ios:admin — iPhone 16 Pro Max: самый
# новый, что есть в Xcode 16.2 (iPhone 18 Pro Max появится только в новом
# Xcode). Остальные симуляторы выключаются — на 8 ГБ памяти два не тянут.
NAME="iPhone 16 Pro Max"
SIM=$(xcrun simctl list devices available | grep -m1 -F "$NAME (" | grep -oE '[0-9A-F-]{36}')
if [ -z "$SIM" ]; then
  echo "Нет симулятора $NAME — создайте его в Xcode → Window → Devices and Simulators" >&2
  exit 1
fi
xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | grep -v "$SIM" | while read -r other; do
  xcrun simctl shutdown "$other"
done
xcrun simctl boot "$SIM" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$SIM"
