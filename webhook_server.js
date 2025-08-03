const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = 3001;
const SECRET = process.env.WEBHOOK_SECRET || 'zenith_bot_webhook_secret_2025';

app.use(express.json());

// Логирование
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

// Функция для проверки подписи GitHub
function verifySignature(payload, signature) {
    if (!SECRET || !signature) return true; // Если секрет не установлен, пропускаем проверку
    
    const hmac = crypto.createHmac('sha256', SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Функция автообновления
function performUpdate() {
    return new Promise((resolve, reject) => {
        const commands = [
            'cd /opt/zenith-bot',
            'git fetch origin',
            'git reset --hard origin/main', 
            'git pull origin main',
            'npm install --production',
            'pm2 restart zenith-bot',
            'sleep 2',
            'pm2 status zenith-bot'
        ].join(' && ');
        
        log('🚀 Запускаем автообновление...');
        
        exec(commands, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                log(`❌ Ошибка обновления: ${error.message}`);
                reject(error);
                return;
            }
            
            log('✅ Обновление завершено успешно');
            if (stdout) log(`Вывод: ${stdout}`);
            if (stderr) log(`Предупреждения: ${stderr}`);
            
            resolve(stdout);
        });
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-hub-signature-256'];
        const payload = JSON.stringify(req.body);
        
        // Проверяем подпись
        if (!verifySignature(payload, signature)) {
            log('❌ Неверная подпись webhook');
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        log('🔔 Получен webhook от GitHub');
        
        // Проверяем что это push в main ветку
        if (req.body.ref === 'refs/heads/main') {
            log(`📝 Push от ${req.body.pusher?.name || 'неизвестного пользователя'}`);
            log(`� Коммитов: ${req.body.commits?.length || 0}`);
            
            try {
                await performUpdate();
                res.status(200).json({ 
                    success: true, 
                    message: 'Bot updated successfully' 
                });
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        } else {
            log(`ℹ️ Игнорируем push в ветку: ${req.body.ref}`);
            res.status(200).json({ 
                success: true, 
                message: 'Ignored non-main branch' 
            });
        }
    } catch (error) {
        log(`❌ Ошибка обработки webhook: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Endpoint для ручного обновления
app.post('/manual-update', async (req, res) => {
    log('🔄 Запрошено ручное обновление');
    
    try {
        await performUpdate();
        res.status(200).json({ 
            success: true, 
            message: 'Manual update completed' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    log(`🔗 Webhook сервер запущен на порту ${PORT}`);
    log(`📡 Webhook URL: http://your-server:${PORT}/webhook`);
    log(`🔧 Manual update: http://your-server:${PORT}/manual-update`);
    log(`❤️ Health check: http://your-server:${PORT}/health`);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    log(`💥 Необработанная ошибка: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
    log(`💥 Необработанное отклонение: ${reason}`);
});

module.exports = app;
