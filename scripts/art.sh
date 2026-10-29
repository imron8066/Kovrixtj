#!/bin/bash
# Собирает и запускает программу рисования из scripts/art/<имя>/ вместе с
# общими scripts/art/*.swift (логотип, цвета, надписи, видео и звук).
#   bash scripts/art.sh brand        — логотип, значки, обложки игр, реклама
#   bash scripts/art.sh ad-video     — видеореклама 15 с
#   bash scripts/art.sh bot-video    — кадры бота для общего ролика
#   bash scripts/art.sh promo-video  — ролик: приложение, сайт и бот
set -e
cd "$(dirname "$0")/.."
NAME="$1"
shift || true
if [ ! -f "scripts/art/$NAME/main.swift" ]; then
  echo "Использование: bash scripts/art.sh brand|ad-video|bot-video|promo-video"
  exit 1
fi
mkdir -p builds/brand
swiftc -O -suppress-warnings scripts/art/*.swift "scripts/art/$NAME/main.swift" -o "builds/brand/$NAME"
"builds/brand/$NAME" "$@"
