#!/bin/bash
# Скрипт скачивает иконку и конвертирует во все нужные форматы
# Запускать из папки electron-build/
# Требует: macOS (sips + iconutil), ImageMagick (convert) для .ico

set -e

ICON_URL="https://cdn.poehali.dev/projects/b92a8c65-f081-4684-87a0-bfb308c5c2e4/files/cb6a2214-1778-4cbf-a49d-0962368b426c.jpg"

echo "Скачиваю иконку..."
curl -L -o icon_source.jpg "$ICON_URL"

echo "Конвертирую в PNG 1024x1024..."
sips -s format png icon_source.jpg --out icon_1024.png

# ---- macOS: .icns ----
echo "Создаю iconset для macOS..."
mkdir -p BrowserCtrl.iconset

sips -z 16 16     icon_1024.png --out BrowserCtrl.iconset/icon_16x16.png
sips -z 32 32     icon_1024.png --out BrowserCtrl.iconset/icon_16x16@2x.png
sips -z 32 32     icon_1024.png --out BrowserCtrl.iconset/icon_32x32.png
sips -z 64 64     icon_1024.png --out BrowserCtrl.iconset/icon_32x32@2x.png
sips -z 128 128   icon_1024.png --out BrowserCtrl.iconset/icon_128x128.png
sips -z 256 256   icon_1024.png --out BrowserCtrl.iconset/icon_128x128@2x.png
sips -z 256 256   icon_1024.png --out BrowserCtrl.iconset/icon_256x256.png
sips -z 512 512   icon_1024.png --out BrowserCtrl.iconset/icon_256x256@2x.png
sips -z 512 512   icon_1024.png --out BrowserCtrl.iconset/icon_512x512.png
cp icon_1024.png                    BrowserCtrl.iconset/icon_512x512@2x.png

echo "Собираю .icns..."
iconutil -c icns BrowserCtrl.iconset -o icon.icns
echo "✓ icon.icns готов"

# ---- Linux: icon.png (256x256) ----
echo "Создаю icon.png для Linux..."
sips -z 256 256 icon_1024.png --out icon.png
echo "✓ icon.png готов"

# ---- Windows: icon.ico (multi-size) ----
echo "Создаю icon.ico для Windows..."
if command -v convert &> /dev/null; then
  sips -z 16 16   icon_1024.png --out icon_16.png
  sips -z 32 32   icon_1024.png --out icon_32.png
  sips -z 48 48   icon_1024.png --out icon_48.png
  sips -z 64 64   icon_1024.png --out icon_64.png
  sips -z 128 128 icon_1024.png --out icon_128.png
  sips -z 256 256 icon_1024.png --out icon_256.png
  convert icon_16.png icon_32.png icon_48.png icon_64.png icon_128.png icon_256.png icon.ico
  rm icon_16.png icon_32.png icon_48.png icon_64.png icon_128.png icon_256.png
  echo "✓ icon.ico готов"
else
  echo "⚠ ImageMagick не найден — icon.ico не создан"
  echo "  Установи: brew install imagemagick"
  echo "  Затем повтори: bash make-icon.sh"
fi

# ---- Чистим временные файлы ----
echo "Чищу временные файлы..."
rm -rf BrowserCtrl.iconset icon_source.jpg icon_1024.png

echo ""
echo "Готово! Файлы в electron-build/:"
ls -lh icon.* 2>/dev/null || true
