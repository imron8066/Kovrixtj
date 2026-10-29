#!/bin/bash
# Включает Donix на этом Mac: аккаунты бота и владельца, бот на своём сервере,
# туннель Cloudflare в интернет (служба, сама поднимается после перезагрузки).
# Запуск: bash scripts/go-live.sh
set -e
cd "$(dirname "$0")/.."
ROOT=$PWD
UIDN=$(id -u)

echo "1) Аккаунты на сервере"
node server/tool.js bot
if [ ! -f server/data/owner.txt ]; then
  PW=$(node -e "console.log(require('crypto').randomInt(10000000,99999999))")
  node server/tool.js owner Imron "$PW"
  echo "Imron $PW" > server/data/owner.txt
  chmod 600 server/data/owner.txt
fi

echo "2) Бот — на свой сервер"
[ -f bot/.env.firebase-backup ] || cp bot/.env bot/.env.firebase-backup
sed -i '' 's#^FIREBASE_DB=.*#FIREBASE_DB=http://127.0.0.1:8080/api/db#' bot/.env
npm run bot:off >/dev/null 2>&1 || true
npm run bot:on

echo "3) Туннель Cloudflare"
command -v cloudflared >/dev/null || brew install cloudflared
CF=$(command -v cloudflared)
P=~/Library/LaunchAgents/tj.donix.tunnel.plist
cat > "$P" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>tj.donix.tunnel</string>
  <key>ProgramArguments</key><array><string>$CF</string><string>tunnel</string><string>--no-autoupdate</string><string>--url</string><string>http://localhost:8080</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/server/tunnel.log</string>
  <key>StandardErrorPath</key><string>$ROOT/server/tunnel.log</string>
</dict></plist>
EOF
launchctl bootout gui/$UIDN/tj.donix.tunnel 2>/dev/null || true
: > server/tunnel.log
launchctl bootstrap gui/$UIDN "$P"

# Mac не засыпает, пока подключён к зарядке
sudo -n pmset -c sleep 0 2>/dev/null || echo "(чтобы Mac не засыпал: Настройки → Аккумулятор → не переходить в сон от сети)"

for i in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' server/tunnel.log | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
echo
echo "ГОТОВО"
echo "Адрес сервера: ${URL:-не получен, см. server/tunnel.log}"
echo "Вход владельца: $(cat server/data/owner.txt)"
