@echo off
cd /d "%~dp0"
if not exist "node_modules\ws\package.json" (
    call npm ci --omit=dev
    if errorlevel 1 (
        echo Khong cai duoc server. Kiem tra Node.js va ket noi Internet.
        pause
        exit /b 1
    )
)
call npm start
