#!/bin/bash
# MBA Browser — установка и запуск одной командой
# Использование: bash install.sh

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       MBA Browser — установка        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js не найден.${NC}"
  echo "  Установи с https://nodejs.org (версия 18+) и запусти скрипт снова."
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}✗ Нужен Node.js 18+, найден $(node -v)${NC}"
  echo "  Обнови Node.js: https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Проверка npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm не найден.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Определяем корень проекта (скрипт лежит в electron-build/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}▶ Устанавливаю зависимости React...${NC}"
cd "$PROJECT_ROOT"
npm install --silent
echo -e "${GREEN}✓ React зависимости установлены${NC}"

echo ""
echo -e "${CYAN}▶ Устанавливаю зависимости Electron...${NC}"
cd "$SCRIPT_DIR/webapp"
npm install --silent
echo -e "${GREEN}✓ Electron зависимости установлены${NC}"

# Проверка Chrome
echo ""
echo -e "${CYAN}▶ Ищу Chrome / Chromium...${NC}"
CHROME_FOUND=false
CHROME_PATH=""

if [[ "$OSTYPE" == "darwin"* ]]; then
  for p in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
    if [ -f "$p" ]; then
      CHROME_PATH="$p"
      CHROME_FOUND=true
      break
    fi
  done
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  for p in /usr/bin/google-chrome /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
    if [ -f "$p" ]; then
      CHROME_PATH="$p"
      CHROME_FOUND=true
      break
    fi
  done
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "win32" ]]; then
  for p in \
    "C:/Program Files/Google/Chrome/Application/chrome.exe" \
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
    if [ -f "$p" ]; then
      CHROME_PATH="$p"
      CHROME_FOUND=true
      break
    fi
  done
fi

if $CHROME_FOUND; then
  echo -e "${GREEN}✓ Chrome найден: $CHROME_PATH${NC}"
else
  echo -e "${YELLOW}⚠ Chrome не найден. Установи Google Chrome: https://www.google.com/chrome${NC}"
  echo -e "  После установки укажи путь вручную в приложении: Settings → Путь к Chromium"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Установка завершена!          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "Для запуска приложения:"
echo ""
echo -e "  ${CYAN}Терминал 1:${NC} cd $(basename "$PROJECT_ROOT") && npm run dev"
echo -e "  ${CYAN}Терминал 2:${NC} cd $(basename "$PROJECT_ROOT")/electron-build/webapp && npm run dev"
echo ""

# Предложить запустить сразу
read -p "Запустить приложение прямо сейчас? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${CYAN}▶ Запускаю React dev-сервер в фоне...${NC}"
  cd "$PROJECT_ROOT"
  npm run dev &
  VITE_PID=$!

  echo -e "${CYAN}▶ Жду запуска сервера...${NC}"
  sleep 4

  echo -e "${CYAN}▶ Запускаю Electron...${NC}"
  cd "$SCRIPT_DIR/webapp"
  npm run start

  # Останавливаем Vite при выходе
  kill $VITE_PID 2>/dev/null || true
fi