@echo off
chcp 65001 > nul
echo ============================================================
echo   Prekladac rozhodnuti - Spusteni aplikace na pocitaci
echo ============================================================
echo.

node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo [CHYBA] Na pocitaci neni nainstalovan Node.js!
    echo Stahnete si jej zdarma z: https://nodejs.org/ (verze LTS)
    echo Po instalaci Node.js spustte tento soubor znovu.
    echo.
    pause
    exit /b
)

echo [1/3] Kontrola zavislosti...
if not exist "node_modules\" (
    echo Instaluji knihovny (npm install)... Muze to trvat minutu.
    call npm install
)

echo.
echo [2/3] Kontrola konfigurace .env...
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env > nul
        echo Vytvoren soubor .env z .env.example.
    )
)

echo.
echo [3/3] Spoustim aplikaci na http://localhost:3000 ...
echo Pro ukonceni stisknete Ctrl+C v tomto okne.
echo.

start http://localhost:3000
call npm run dev
pause
