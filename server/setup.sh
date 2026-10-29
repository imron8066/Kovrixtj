#!/bin/bash
# Настройка VPS (Ubuntu/Debian). Запускает scripts/vps.sh с Mac — руками не нужно.
#   bash /opt/donix/server/setup.sh [домен]
# Ставит Node и Caddy, заводит службы donix-server и donix-bot.
# С доменом Caddy сам получает HTTPS; без домена сайт открывается по IP (http).
set -e
DOMAIN="$1"
APP=/opt/donix

export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -q
  apt-get install -yq curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -yq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi

id donix >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin donix
mkdir -p "$APP/server/data"
chown -R donix:donix "$APP"
chmod 700 "$APP/server/data"

cat > /etc/systemd/system/donix-server.service <<EOF
[Unit]
Description=Donix server (база, вход, сайт)
After=network.target

[Service]
User=donix
WorkingDirectory=$APP
Environment=PORT=8080
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/donix-bot.service <<EOF
[Unit]
Description=Donix Telegram bot
After=donix-server.service
Requires=donix-server.service

[Service]
User=donix
WorkingDirectory=$APP
ExecStart=/usr/bin/node bot/bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

SITE="${DOMAIN:-:80}"
cat > /etc/caddy/Caddyfile <<EOF
$SITE {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF

# наружу — только SSH и сайт
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

systemctl daemon-reload
systemctl enable --now donix-server >/dev/null
systemctl restart donix-server
systemctl restart caddy
if [ -f "$APP/bot/.env" ]; then
  systemctl enable --now donix-bot >/dev/null
  systemctl restart donix-bot
fi
sleep 2
systemctl --no-pager --lines=3 status donix-server | head -5
echo "Готово: ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://<IP сервера>}"
