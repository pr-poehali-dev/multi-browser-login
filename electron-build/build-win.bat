@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: MBA Browser — автоматическая сборка установщика для Windows
:: Запуск: дважды кликни build-win.bat или запусти из корня проекта

title MBA Browser — Сборка установщика

echo.
echo ╔══════════════════════════════════════════╗
echo ║       MBA Browser — сборка Windows       ║
echo ╚══════════════════════════════════════════╝
echo.

:: ── Определяем пути ──────────────────────────────────────────────────────────
set "SCRIPT_DIR=%~dp0"
:: Убираем trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PROJECT_ROOT=%SCRIPT_DIR%\.."
set "WEBAPP_DIR=%SCRIPT_DIR%\webapp"
set "OUTPUT_DIR=%WEBAPP_DIR%\dist"

:: ── Проверка Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден.
    echo.
    echo Установи Node.js с https://nodejs.org ^(версия 18+^)
    echo После установки запусти этот файл снова.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%i in ('node -v') do set "NODE_MAJOR=%%i"
for /f "tokens=2 delims=v." %%i in ('node -v') do set "NODE_MAJOR=%%i"
echo [OK] Node.js найден: 
node -v

:: ── Проверка npm ─────────────────────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] npm не найден.
    pause
    exit /b 1
)
echo [OK] npm найден

:: ── Установка зависимостей React ─────────────────────────────────────────────
echo.
echo [1/4] Устанавливаю зависимости React...
cd /d "%PROJECT_ROOT%"
call npm install --silent
if errorlevel 1 (
    echo [ОШИБКА] npm install завершился с ошибкой
    pause
    exit /b 1
)
echo [OK] Зависимости React установлены

:: ── Сборка React (Vite) ──────────────────────────────────────────────────────
echo.
echo [2/4] Собираю интерфейс...
call npm run build
if errorlevel 1 (
    echo [ОШИБКА] Сборка интерфейса завершилась с ошибкой
    pause
    exit /b 1
)
echo [OK] Интерфейс собран

:: ── Установка зависимостей Electron ─────────────────────────────────────────
echo.
echo [3/4] Устанавливаю зависимости Electron...
cd /d "%WEBAPP_DIR%"
call npm install --silent
if errorlevel 1 (
    echo [ОШИБКА] npm install Electron завершился с ошибкой
    pause
    exit /b 1
)
echo [OK] Зависимости Electron установлены

:: ── Сборка .exe установщика ──────────────────────────────────────────────────
echo.
echo [4/4] Собираю MBA Browser Setup.exe...
echo      Это займёт 2-5 минут...
echo.
call npx electron-builder --win --x64
if errorlevel 1 (
    echo.
    echo [ОШИБКА] Сборка завершилась с ошибкой. Смотри лог выше.
    pause
    exit /b 1
)

:: ── Результат ─────────────────────────────────────────────────────────────────
echo.
set "EXE_FILE="
for /r "%OUTPUT_DIR%" %%f in ("*.exe") do (
    if not "%%~nf"=="Uninstall MBA Browser" (
        set "EXE_FILE=%%f"
    )
)

if defined EXE_FILE (
    echo ╔══════════════════════════════════════════╗
    echo ║          Сборка готова!                  ║
    echo ╚══════════════════════════════════════════╝
    echo.
    echo   Файл: !EXE_FILE!
    echo.
    echo   Как установить:
    echo   1. Запусти MBA Browser Setup.exe
    echo   2. Следуй инструкциям установщика
    echo   3. Ярлык появится на рабочем столе и в меню Пуск
    echo.
    :: Открываем папку с файлом
    explorer "%OUTPUT_DIR%"
) else (
    echo [ОШИБКА] Файл установщика не найден в %OUTPUT_DIR%
    echo Проверь ошибки выше.
)

echo.
pause
