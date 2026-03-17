# BrowserCtrl — сборка и запуск

## Требования

- Node.js 18+
- npm или yarn
- Google Chrome или Chromium (установленный на машине)
- macOS / Windows / Linux

---

## Быстрый старт (разработка)

```bash
# 1. Перейди в папку electron-приложения
cd electron-build/webapp

# 2. Установи зависимости
npm install

# 3. В корне проекта запусти Vite dev-сервер
cd ../..
npm run dev

# 4. В отдельном терминале запусти Electron
cd electron-build/webapp
npm run dev
```

Приложение откроется автоматически. Изменения в React обновляются без перезапуска.

---

## Сборка дистрибутива

### Подготовка иконок (только один раз)

Перед сборкой нужно создать иконки. Требует macOS + ImageMagick:

```bash
# Установи ImageMagick если нет
brew install imagemagick

# Создай иконки (запускать из папки electron-build/)
cd electron-build
bash make-icon.sh
```

Результат: `electron-build/icon.icns` (macOS), `icon.ico` (Windows), `icon.png` (Linux).

### macOS (.dmg)

```bash
cd electron-build/webapp
npm run dist:mac
```

Выходной файл: `electron-build/webapp/dist/BrowserCtrl-*.dmg`

### Windows (.exe installer)

```bash
cd electron-build/webapp
npm run dist:win
```

Выходной файл: `electron-build/webapp/dist/BrowserCtrl Setup *.exe`

### Linux (.AppImage)

```bash
cd electron-build/webapp
npm run dist:linux
```

Выходной файл: `electron-build/webapp/dist/BrowserCtrl-*.AppImage`

---

## Структура проекта

```
electron-build/
├── webapp/
│   ├── electron.js          — главный процесс Electron (окно, IPC handlers)
│   ├── preload.js           — мост: экспортирует window.electronAPI в React
│   ├── browser-manager.js   — управление Puppeteer (запуск, шаги, логи)
│   ├── package.json         — зависимости и конфиг electron-builder
│   ├── vite.electron.config.ts
│   └── make-icon.sh         — генерация иконок из CDN-изображения
├── icon.icns                — иконка macOS (генерируется make-icon.sh)
├── icon.ico                 — иконка Windows
└── icon.png                 — иконка Linux
```

---

## Как работает автоматизация

### Шаги сценария

| Тип | Что делает | Параметры |
|---|---|---|
| `navigate` | Открыть страницу | `url` |
| `click` | Кликнуть по элементу | `selector`, `timeout` |
| `type` | Ввести текст | `selector`, `value` |
| `wait` | Пауза | `ms` |
| `condition` | Условие (если элемент найден) | `selector`, `action` (stop/retry/skip) |
| `extract` | Извлечь данные в переменную | `selector`, `attr`, `varName` |
| `scroll` | Прокрутить страницу | `direction` (up/down/to-element), `selector` |
| `screenshot` | Сохранить скриншот | `name` |

### Переменные в шагах

Значения из шага `extract` можно использовать в последующих шагах через `{{varName}}`:

```
Шаг 1: extract → selector: .price, varName: price
Шаг 2: type    → value: {{price}}
```

### Скриншоты

Сохраняются в `~/BrowserCtrl/screenshots/`

### Профили браузера

Каждая сессия получает отдельный профиль в `~/BrowserCtrl/profiles/session_N/`  
Это позволяет держать cookies и сессии изолированными.

---

## Настройки

В разделе **Settings** приложения:

| Настройка | Описание |
|---|---|
| Путь к Chromium | Если Chrome не определяется автоматически |
| Папка профилей | Где хранятся сессии браузеров (по умолчанию `~/BrowserCtrl/profiles`) |
| Папка логов | Где сохраняются логи |
| Headless | Запускать браузеры без GUI |
| Отключить изображения | Ускоряет загрузку страниц |
| Макс. браузеров | Ограничение одновременных сессий |

---

## Автоматическое определение Chrome

Приложение ищет браузер в стандартных местах:

**macOS:**
- `/Applications/Google Chrome.app/...`
- `/Applications/Chromium.app/...`
- `/Applications/Brave Browser.app/...`

**Windows:**
- `C:\Program Files\Google\Chrome\...`
- `%LOCALAPPDATA%\Google\Chrome\...`

**Linux:**
- `/usr/bin/google-chrome`
- `/usr/bin/chromium-browser`
- `/snap/bin/chromium`

Если ни один не найден — укажи путь вручную в **Settings → Путь к Chromium**.

---

## Частые проблемы

**"Chrome/Chromium не найден"**  
→ Установи Google Chrome или укажи путь в Настройках

**Браузер открывается, но не выполняет шаги**  
→ Проверь CSS-селекторы в сценарии (DevTools → Inspect)

**Ошибка при сборке .dmg на macOS**  
→ Убедись что `icon.icns` создан: `bash make-icon.sh`

**Ошибка при сборке .exe на Windows**  
→ Установи Wine если собираешь с macOS: `brew install --cask wine-stable`
