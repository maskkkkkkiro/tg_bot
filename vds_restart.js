const { Client } = require('ssh2');
const express = require('express');

// Данные VDS
const VDS_CONFIG = {
    host: '92.51.22.201',
    username: 'root',
    password: 'o*-?k*4UNaAU8p',
    port: 22
};

// Функция перезапуска бота на VDS
function restartBot() {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        
        conn.on('ready', () => {
            console.log('🔗 Подключение к VDS установлено');
            
            // Команды для перезапуска бота
            const commands = [
                'cd /root/tg_bot',
                'git pull origin main',
                'npm install',
                'pm2 restart zenith-bot'
            ];
            
            const executeCommand = (index) => {
                if (index >= commands.length) {
                    conn.end();
                    resolve('✅ Бот успешно перезапущен на VDS!');
                    return;
                }
                
                console.log(`📝 Выполняем: ${commands[index]}`);
                conn.exec(commands[index], (err, stream) => {
                    if (err) {
                        conn.end();
                        reject(`❌ Ошибка выполнения команды: ${err.message}`);
                        return;
                    }
                    
                    let output = '';
                    stream.on('data', (data) => {
                        output += data.toString();
                    });
                    
                    stream.on('close', (code) => {
                        console.log(`✅ Команда выполнена: ${commands[index]}`);
                        if (output) console.log(`📤 Вывод: ${output.trim()}`);
                        executeCommand(index + 1);
                    });
                });
            };
            
            executeCommand(0);
        });
        
        conn.on('error', (err) => {
            reject(`❌ Ошибка подключения к VDS: ${err.message}`);
        });
        
        conn.connect(VDS_CONFIG);
    });
}

// Express сервер для webhook перезапуска
const app = express();
app.use(express.json());

// Endpoint для ручного перезапуска
app.post('/restart-bot', async (req, res) => {
    try {
        console.log('🚀 Получен запрос на перезапуск бота...');
        const result = await restartBot();
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('❌ Ошибка перезапуска:', error);
        res.status(500).json({ success: false, error: error });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'VDS Bot Restart Service' });
});

// Запуск сервера
const PORT = 3002;
app.listen(PORT, () => {
    console.log(`🌐 VDS Restart Service запущен на порту ${PORT}`);
    console.log(`📡 Endpoint: http://localhost:${PORT}/restart-bot`);
});

// Экспорт для использования как модуль
module.exports = { restartBot };
