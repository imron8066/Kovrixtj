#!/bin/bash
# Переносит Telegram-бота на VPS, чтобы он работал круглосуточно, даже когда
# Mac выключен. База и сайт остаются в Firebase — на VPS только бот.
#   npm run bot:vps -- root@<IP>
# Повторный запуск обновляет бота на VPS (новый bot.js, APK, цены, версия).
# Сервер: любой Ubuntu/Debian, 512 МБ памяти хватит, вход по SSH.
set -e
HOST="$1"
if [ -z "$HOST" ]; then
  echo "Использование: npm run bot:vps -- root@<IP сервера>"
  exit 1
fi
cd "$(dirname "$0")/.."
APP=/opt/donix

echo "→ проверяю вход на $HOST"
ssh -o ConnectTimeout=15 "$HOST" "mkdir -p $APP/bot $APP/builds $APP/src/shared $APP/web/shared $APP/android/app"

echo "→ копирую бота"
# состояние бота (.env, .keyboards.json, .banners.json …) едет вместе с ним
rsync -az --exclude 'bot.log' --exclude '.DS_Store' --exclude '.env.save' bot/ "$HOST:$APP/bot/"
# бот читает отсюда Firebase, цены, версию и APK
rsync -az src/shared/config.ts "$HOST:$APP/src/shared/"
rsync -az web/shared/data.js "$HOST:$APP/web/shared/"
rsync -az android/app/build.gradle "$HOST:$APP/android/app/"
rsync -az --exclude 'play/' --exclude 'debug/' builds/ "$HOST:$APP/builds/"

echo "→ настраиваю службу на VPS"
ssh "$HOST" "APP=$APP bash -s" <<'REMOTE'
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -q
  apt-get install -yq curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
timedatectl set-timezone Asia/Dushanbe 2>/dev/null || true
id donix >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin donix
chown -R donix:donix "$APP"
chmod 600 "$APP/bot/.env"

cat > /etc/systemd/system/donix-bot.service <<EOF
[Unit]
Description=Donix Telegram bot
After=network-online.target
Wants=network-online.target

[Service]
User=donix
WorkingDirectory=$APP/bot
ExecStart=$(command -v node) bot.js
Restart=always
RestartSec=10
StandardOutput=append:$APP/bot/bot.log
StandardError=append:$APP/bot/bot.log

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable donix-bot >/dev/null 2>&1
systemctl restart donix-bot
sleep 5
systemctl is-active donix-bot
tail -n 5 "$APP/bot/bot.log"
REMOTE

# два бота с одним токеном мешают друг другу — на Mac выключаем
node scripts/bot-service.js off
echo
echo "Готово: бот работает на $HOST круглосуточно, на Mac он выключен."
echo "Журнал: ssh $HOST tail -f $APP/bot/bot.log"
