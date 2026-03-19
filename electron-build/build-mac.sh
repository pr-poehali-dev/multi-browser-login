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
OUTPUT_DIR="$WEBAPP_DIR/dist"

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

  # Скачиваем PNG-логотип с CDN
  PNG_SRC="https://cdn.poehali.dev/projects/b92a8c65-f081-4684-87a0-bfb308c5c2e4/files/0d735473-25d1-47dd-8cce-17327ef9d26e.jpg"
  TMP_PNG="$SCRIPT_DIR/icon_tmp.png"

  if command -v curl &> /dev/null; then
    curl -sL "$PNG_SRC" -o "$TMP_PNG"
  elif command -v wget &> /dev/null; then
    wget -q "$PNG_SRC" -O "$TMP_PNG"
  else
    echo -e "${RED}✗ curl или wget не найден. Установи curl и запусти снова.${NC}"
    exit 1
  fi

  # Создаём iconset
  ICONSET_DIR="$SCRIPT_DIR/MBABrowser.iconset"
  mkdir -p "$ICONSET_DIR"

  for SIZE in 16 32 64 128 256 512; do
    sips -z $SIZE $SIZE "$TMP_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" &>/dev/null
    DOUBLE=$((SIZE * 2))
    sips -z $DOUBLE $DOUBLE "$TMP_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}@2x.png" &>/dev/null
  done

  iconutil -c icns "$ICONSET_DIR" -o "$ICON_PATH"
  rm -rf "$ICONSET_DIR" "$TMP_PNG"
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

# ── Сборка .dmg ───────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Собираю MBA Browser.dmg...${NC}"
echo -e "${YELLOW}  Это займёт 1-3 минуты...${NC}"
npx electron-builder --mac --x64 --arm64 2>&1 | grep -E "(Building|Packaging|Signing|Done|Error|error)" || true

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
