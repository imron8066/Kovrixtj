#!/bin/bash
# Выкладывает сервер, сайт, бота и APK на VPS и (пере)запускает их.
#   bash scripts/vps.sh root@<IP> [домен]
# Повторный запуск обновляет файлы; база на сервере (server/data) не трогается.
# Бот после этого работает на VPS — на Mac его надо выключить: npm run bot:off
set -e
HOST="$1"
DOMAIN="$2"
if [ -z "$HOST" ]; then
  echo "Использование: bash scripts/vps.sh root@<IP> [домен]"
  exit 1
fi
cd "$(dirname "$0")/.."
APP=/opt/donix
SITE="${DOMAIN:+https://$DOMAIN}"
SITE="${SITE:-http://${HOST#*@}}"

# .env бота для сервера: база и вход — на этом же VPS
ENV_TMP="$(mktemp)"
grep -v '^\(FIREBASE_DB\|AUTH_URL\|SITE_URL\)=' bot/.env > "$ENV_TMP"
{
  echo "FIREBASE_DB=http://127.0.0.1:8080/api/db"
  echo "SITE_URL=$SITE"
} >> "$ENV_TMP"

ssh "$HOST" "mkdir -p $APP/server/data $APP/bot $APP/builds $APP/firebase"
rsync -az --delete --exclude '.*' web/ "$HOST:$APP/web/"
rsync -az --exclude 'data/' server/ "$HOST:$APP/server/"
rsync -az firebase/database.rules.json "$HOST:$APP/firebase/"
rsync -az --exclude '.env*' --exclude 'bot.log' --exclude '.DS_Store' bot/ "$HOST:$APP/bot/"
rsync -az --chmod=F600 "$ENV_TMP" "$HOST:$APP/bot/.env"
rsync -az --exclude 'play/' --exclude 'debug/' builds/ "$HOST:$APP/builds/"
rm -f "$ENV_TMP"

ssh "$HOST" "chown -R donix:donix $APP 2>/dev/null; bash $APP/server/setup.sh $DOMAIN"
echo "Сайт: $SITE"
