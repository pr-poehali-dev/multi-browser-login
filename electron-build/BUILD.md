# Сборка BrowserCtrl.dmg для macOS

## Что нужно
- macOS (для подписи и сборки .dmg)
- Node.js 18+ (https://nodejs.org)

## Шаги

### 1. Скачай код проекта
Скачать → Скачать код (или через GitHub)

### 2. Собери React-приложение для Electron
В корне проекта:
```bash
npx vite build --config electron-build/vite.electron.config.ts
```

### 3. Установи зависимости Electron
```bash
cd electron-build
npm install
```

### 4. Собери .dmg
```bash
npm run dist
```

### 5. Готово
Файл появится в `electron-build/release/BrowserCtrl-1.0.0.dmg`

Открой .dmg, перетащи приложение в папку Applications — и всё готово.
