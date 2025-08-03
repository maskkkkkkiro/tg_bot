@echo off
echo 🚀 Перезапуск бота на VDS...
echo.

REM Проверяем наличие Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js не найден! Установите Node.js
    pause
    exit /b 1
)

REM Устанавливаем зависимость ssh2 если нужно
npm list ssh2 >nul 2>&1
if errorlevel 1 (
    echo 📦 Устанавливаем ssh2...
    npm install ssh2
)

REM Запускаем скрипт перезапуска
echo 🔄 Подключаемся к VDS и перезапускаем бота...
node -e "
const { restartBot } = require('./vds_restart.js');
restartBot()
    .then(result => {
        console.log(result);
        console.log('✅ Готово!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    });
"

echo.
echo 📋 Нажмите любую клавишу для закрытия...
pause >nul
