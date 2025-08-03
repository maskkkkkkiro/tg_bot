const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = 3001;
const SECRET = 'your_webhook_secret'; // Замените на ваш секрет

app.use(express.json());

// Функция для проверки подписи GitHub
function verifySignature(payload, signature) {
    const hmac = crypto.createHmac('sha256', SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// Webhook endpoint
app.post('/webhook', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    const payload = JSON.stringify(req.body);
    
    // Проверяем подпись (опционально)
    if (SECRET && signature && !verifySignature(payload, signature)) {
        console.log('❌ Неверная подпись webhook');
        return res.status(401).send('Unauthorized');
    }
    
    console.log('🔔 Получен webhook от GitHub');
    
    // Проверяем что это push в main ветку
    if (req.body.ref === 'refs/heads/main') {
        console.log('🚀 Обновляем бота...');
        
        // Выполняем команды обновления
        exec('cd /opt/zenith-bot && git pull origin main && pm2 restart zenith-bot', (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Ошибка обновления:', error);
                return res.status(500).send('Update failed');
            }
            
            console.log('✅ Обновление завершено:', stdout);
            if (stderr) console.log('Warnings:', stderr);
            
            res.status(200).send('Updated successfully');
        });
    } else {
        console.log('ℹ️ Игнорируем push не в main ветку');
        res.status(200).send('Ignored');
    }
});

app.listen(PORT, () => {
    console.log(`🔗 Webhook сервер запущен на порту ${PORT}`);
});

module.exports = app;
