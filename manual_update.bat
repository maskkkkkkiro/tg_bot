@echo off
echo 🚀 Ручное обновление Zenith Bot на VDS...
echo.

REM Проверяем наличие ssh2
npm list ssh2 >nul 2>&1
if errorlevel 1 (
    echo 📦 Устанавливаем ssh2...
    npm install ssh2
)

echo 🔗 Подключаемся к VDS и обновляем бота...
node -e "
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('📍 Подключен к VDS');
    
    const commands = [
        'cd /opt/zenith-bot',
        'git fetch origin',
        'git reset --hard origin/main', 
        'git pull origin main',
        'npm install --production',
        'pm2 restart zenith-bot || pm2 start ecosystem.config.js',
        'pm2 status'
    ];
    
    let index = 0;
    
    function runCommand() {
        if (index >= commands.length) {
            console.log('✅ Обновление завершено!');
            conn.end();
            return;
        }
        
        const cmd = commands[index];
        console.log('📝 Выполняем:', cmd);
        
        conn.exec(cmd, (err, stream) => {
            if (err) {
                console.error('❌ Ошибка:', err.message);
                conn.end();
                return;
            }
            
            stream.on('data', (data) => {
                process.stdout.write(data.toString());
            });
            
            stream.on('close', () => {
                index++;
                setTimeout(runCommand, 1000);
            });
        });
    }
    
    runCommand();
});

conn.on('error', (err) => {
    console.error('❌ Ошибка подключения:', err.message);
});

conn.connect({
    host: '92.51.22.201',
    username: 'root',
    password: 'o*-?k*4UNaAU8p',
    port: 22
});
"

echo.
echo 📋 Нажмите любую клавишу для закрытия...
pause >nul
