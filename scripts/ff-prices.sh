#!/bin/sh
# Прайс Free Fire 27.10.2026: обычные цены, оплата (с 28.10: Алиф 205009990,
# Visa 4444…0242, Эсхата 4439…1931; DCity и Mastercard скрыты), цены промокода дня
# (сами коды — DONIX10, FIREMAX… по два дня — ставит бот), затем правила
# базы (daily/, курсы от бота, одноразовые коды usedCodes/) и сайт. Запуск: sh scripts/ff-prices.sh
set -e
cd "$(dirname "$0")/.."
P="--project kovrixtj"
firebase database:set /config/prices/free_fire scripts/data/ff-prices.json $P -f
firebase database:update /config/pay scripts/data/pay.json $P -f
firebase database:set /daily/free_fire scripts/data/ff-daily.json $P -f
node scripts/web-data.js
firebase deploy --only hosting,database $P
echo "Готово: цены, карты и промокод в базе, сайт и правила обновлены"
