#!/bin/bash
# MBA Browser — автоматическая сборка установщика для macOS
# Запуск: bash electron-build/build-mac.sh (из корня проекта)

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEBAPP_DIR="$SCRIPT_DIR/webapp"
OUTPUT_DIR="$WEBAPP_DIR/release"

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║        MBA Browser — сборка macOS        ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Проверка Node.js ──────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js не найден.${NC}"
  echo "  Установи с https://nodejs.org (версия 18+) и запусти снова."
  exit 1
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}✗ Нужен Node.js 18+, найден $(node -v)${NC}"
  echo "  Обнови: https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# ── Проверка npm ──────────────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm не найден.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# ── Иконка приложения ─────────────────────────────────────────────────────────
ICON_PATH="$SCRIPT_DIR/icon.icns"
if [ ! -f "$ICON_PATH" ]; then
  echo ""
  echo -e "${YELLOW}▶ Генерирую иконку приложения...${NC}"

  PNG_SRC="https://cdn.poehali.dev/projects/b92a8c65-f081-4684-87a0-bfb308c5c2e4/files/0d735473-25d1-47dd-8cce-17327ef9d26e.jpg"
  TMP_JPG="$SCRIPT_DIR/icon_tmp.jpg"
  TMP_PNG="$SCRIPT_DIR/icon_tmp_1024.png"

  # Скачиваем исходник
  curl -sL "$PNG_SRC" -o "$TMP_JPG"

  # Конвертируем JPG → PNG через sips и масштабируем до 1024
  sips -s format png "$TMP_JPG" --out "$TMP_PNG" -z 1024 1024 &>/dev/null

  # Создаём iconset со строго правильными именами для iconutil
  ICONSET_DIR="$SCRIPT_DIR/MBABrowser.iconset"
  rm -rf "$ICONSET_DIR"
  mkdir -p "$ICONSET_DIR"

  sips -z 16   16   "$TMP_PNG" --out "$ICONSET_DIR/icon_16x16.png"    &>/dev/null
  sips -z 32   32   "$TMP_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" &>/dev/null
  sips -z 32   32   "$TMP_PNG" --out "$ICONSET_DIR/icon_32x32.png"    &>/dev/null
  sips -z 64   64   "$TMP_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" &>/dev/null
  sips -z 128  128  "$TMP_PNG" --out "$ICONSET_DIR/icon_128x128.png"  &>/dev/null
  sips -z 256  256  "$TMP_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" &>/dev/null
  sips -z 256  256  "$TMP_PNG" --out "$ICONSET_DIR/icon_256x256.png"  &>/dev/null
  sips -z 512  512  "$TMP_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" &>/dev/null
  sips -z 512  512  "$TMP_PNG" --out "$ICONSET_DIR/icon_512x512.png"  &>/dev/null
  sips -z 1024 1024 "$TMP_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" &>/dev/null

  iconutil -c icns "$ICONSET_DIR" -o "$ICON_PATH"

  rm -rf "$ICONSET_DIR" "$TMP_JPG" "$TMP_PNG"
  echo -e "${GREEN}✓ Иконка создана${NC}"
else
  echo -e "${GREEN}✓ Иконка найдена${NC}"
fi

# ── Установка зависимостей React ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Устанавливаю зависимости React...${NC}"
cd "$PROJECT_ROOT"
npm install --silent
echo -e "${GREEN}✓ Готово${NC}"

# ── Сборка React (Vite) ───────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Собираю интерфейс...${NC}"
npm run build --silent
echo -e "${GREEN}✓ Интерфейс собран${NC}"

# ── Установка зависимостей Electron ───────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Устанавливаю зависимости Electron...${NC}"
cd "$WEBAPP_DIR"
npm install --silent
echo -e "${GREEN}✓ Готово${NC}"

# ── Копируем dist в webapp/dist и фиксим пути для Electron ───────────────────
# ВАЖНО: копируем ПОСЛЕ npm install чтобы electron-builder не игнорировал папку
echo ""
echo -e "${CYAN}▶ Копирую интерфейс в Electron...${NC}"
rm -rf "$WEBAPP_DIR/dist"
mkdir -p "$WEBAPP_DIR/dist"
cp -r "$PROJECT_ROOT/dist/." "$WEBAPP_DIR/dist/"

# Electron загружает через file:// — фиксим пути и убираем скрипты платформы
INDEX_HTML="$WEBAPP_DIR/dist/index.html"
if [ -f "$INDEX_HTML" ]; then
  # Относительные пути для file:// протокола
  sed -i '' 's|src="/assets/|src="./assets/|g' "$INDEX_HTML"
  sed -i '' 's|href="/assets/|href="./assets/|g' "$INDEX_HTML"

  # Убираем ВСЕ скрипты платформы и аналитики — они ломают Electron (file://)
  # Создаём чистый index.html с только нужными тегами
  node -e "
    const fs = require('fs');
    let html = fs.readFileSync('$INDEX_HTML', 'utf8');
    // Удаляем все script-теги с cdn.poehali.dev
    html = html.replace(/<script[^>]*cdn\.poehali\.dev[^>]*><\/script>/gi, '');
    html = html.replace(/<script[^>]*cdn\.poehali\.dev[^>]*>/gi, '');
    // Удаляем весь блок Yandex.Metrika (от комментария до комментария)
    html = html.replace(/<!-- Yandex\.Metrika[\s\S]*?\/Yandex\.Metrika counter -->/gi, '');
    // Удаляем оставшиеся inline-скрипты аналитики
    html = html.replace(/<script[^>]*>[\s\S]*?ym\([\s\S]*?<\/script>/gi, '');
    // Удаляем noscript теги с метрикой
    html = html.replace(/<noscript>[\s\S]*?mc\.yandex[\s\S]*?<\/noscript>/gi, '');
    // Удаляем мета-теги платформы
    html = html.replace(/<meta name=\"pp-name\"[^>]*>/gi, '');
    // Удаляем пустые строки подряд
    html = html.replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync('$INDEX_HTML', html);
  "

  echo -e "${GREEN}✓ index.html подготовлен для Electron${NC}"
else
  echo -e "${RED}✗ dist/index.html не найден! Сборка React не удалась.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Файлов скопировано: $(find "$WEBAPP_DIR/dist" | wc -l | tr -d ' ')${NC}"

# ── Сборка .dmg ───────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Собираю MBA Browser.dmg...${NC}"
echo -e "${YELLOW}  Это займёт 1-3 минуты...${NC}"
npx electron-builder --mac --arm64 2>&1

# ── Результат ─────────────────────────────────────────────────────────────────
DMG_FILE=$(find "$OUTPUT_DIR" -name "*.dmg" | head -1)

echo ""
if [ -n "$DMG_FILE" ]; then
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║            ✓ Сборка готова!             ║${NC}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  Файл: ${BOLD}$DMG_FILE${NC}"
  echo ""
  echo -e "  Как установить:"
  echo -e "  1. Открой .dmg файл"
  echo -e "  2. Перетащи MBA Browser в папку Applications"
  echo -e "  3. Запускай из Launchpad или Spotlight"
  echo ""
  # Открываем папку с готовым файлом
  open "$OUTPUT_DIR" 2>/dev/null || true
else
  echo -e "${RED}✗ DMG файл не найден. Проверь ошибки выше.${NC}"
  exit 1
fi