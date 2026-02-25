#!/bin/bash
# Скрипт скачивает иконку и конвертирует в .icns для macOS
# Запускать из папки electron-build/

set -e

echo "Скачиваю иконку..."
curl -o icon_source.jpg "https://cdn.poehali.dev/projects/b92a8c65-f081-4684-87a0-bfb308c5c2e4/files/bae99300-d1f4-4aa0-a990-dc16e898b80a.jpg"

echo "Конвертирую в PNG..."
sips -s format png icon_source.jpg --out icon_1024.png

echo "Создаю iconset..."
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

echo "Чищу временные файлы..."
rm -rf BrowserCtrl.iconset icon_source.jpg icon_1024.png

echo "✓ Готово: electron-build/icon.icns"
