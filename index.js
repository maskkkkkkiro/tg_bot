const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas } = require('canvas');

// Конфигурация
const BOT_TOKEN = '8386289713:AAErczJrX9v61oDAEgYyitV4QHlYTZDF1x0';
const ADMIN_ID = 7550254535;
const CHANNEL_URL = 'https://t.me/zenithdlc';
const CHANNEL_USERNAME = 'zenithdlc'; // Без @ для проверки подписки

// Создание бота
const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// Отслеживание активных запросов ключей (защита от спама)
const activeKeyRequests = new Set();

// Система рассылок
const broadcastState = new Map(); // userId -> {step, data}

// Система загрузки ключей
const keyUploadState = new Map(); // userId -> {waiting_file: true}

// Система баг репортов
const bugReportState = new Map(); // userId -> {step, type, description}
const SUPPORT_CHAT_ID = -4895236834;

// Система медиа партнерства
const MEDIA_PARTNER_CHAT_ID = -4962158079;
const BETA_CHAT_FREE = 'https://t.me/+epZDVwJeMuo0NmFi';
const BETA_CHAT_PAID = 'https://t.me/+DrX02NC5MKQwMDVi';
const YT_CHAT = 'https://t.me/+pX34mKm87owyNzFi';
const mediaPartnerState = new Map(); // userId -> {step, type, channel, subscribers, about}
const adminPartnerState = new Map(); // adminId -> {step, applicationId, type}
// Система ответов администратора
const adminReplyState = new Map(); // adminUserId -> {waitingReply: true, targetUserId: userId}

// Безопасная функция для редактирования сообщений
async function safeEditMessage(chatId, messageId, text, options = {}) {
    try {
        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } catch (error) {
        // Игнорируем ошибку "message is not modified"
        if (error.message.includes('message is not modified')) {
            console.log('Сообщение не изменилось, пропускаем обновление');
            return null;
        }
        console.error(`Ошибка редактирования сообщения:`, error);
        return null;
    }
}

// Безопасная функция для ответов на callback queries
function safeAnswerCallbackQuery(queryId, text) {
    try {
        bot.answerCallbackQuery(queryId, { text: text });
    } catch (error) {
        console.error('Ошибка answerCallbackQuery:', error);
    }
}

// Безопасная функция для отправки сообщений
async function safeSendMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        if (error.message.includes('user is deactivated') || 
            error.message.includes('bot was blocked') ||
            error.message.includes('user not found') ||
            error.message.includes('chat not found')) {
            console.log(`Пользователь ${chatId} недоступен (заблокировал бота или деактивирован)`);
        } else {
            console.error(`Ошибка отправки сообщения пользователю ${chatId}:`, error.message);
        }
        return null;
    }
}

// Инициализация базы данных
const db = new sqlite3.Database('./bot_database.db');

// Создание таблиц
db.serialize(() => {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        user_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        has_key INTEGER DEFAULT 0,
        key_received TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица ключей
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_key TEXT UNIQUE,
        is_used INTEGER DEFAULT 0,
        used_by INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица капчи
    db.run(`CREATE TABLE IF NOT EXISTS captcha (
        user_id INTEGER PRIMARY KEY,
        answer INTEGER,
        verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица заявок на медиа партнерство
    db.run(`CREATE TABLE IF NOT EXISTS media_partner_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        platform_type TEXT, -- 'tiktok' или 'youtube'
        channel_link TEXT,
        subscribers_count TEXT,
        about_info TEXT,
        status TEXT DEFAULT 'pending', -- 'pending', 'approved_free', 'approved_paid', 'rejected'
        payment_type TEXT, -- 'crypto', 'sbp', NULL
        payment_amount TEXT, -- сумма за видео для платных
        payment_details TEXT, -- номер телефона и банк для СБП
        partner_key TEXT, -- выданный ключ
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME
    )`);

    // Таблица партнерских ключей (отдельно от обычных)
    db.run(`CREATE TABLE IF NOT EXISTS partner_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_key TEXT UNIQUE,
        is_used INTEGER DEFAULT 0,
        used_by INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Функция для генерации капчи
function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let answer;
    let question;
    
    switch(operation) {
        case '+':
            answer = num1 + num2;
            question = `${num1} + ${num2}`;
            break;
        case '-':
            // Убеждаемся, что результат положительный
            if (num1 >= num2) {
                answer = num1 - num2;
                question = `${num1} - ${num2}`;
            } else {
                answer = num2 - num1;
                question = `${num2} - ${num1}`;
            }
            break;
        case '*':
            answer = num1 * num2;
            question = `${num1} × ${num2}`;
            break;
    }
    
    return { question, answer };
}

// Функция для создания изображения капчи
function createCaptchaImage(question) {
    const canvas = createCanvas(200, 80);
    const ctx = canvas.getContext('2d');
    
    // Фон
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 200, 80);
    
    // Добавляем шум
    for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`;
        ctx.fillRect(Math.random() * 200, Math.random() * 80, 2, 2);
    }
    
    // Текст
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(question + ' = ?', 100, 45);
    
    return canvas.toBuffer();
}

// Функция проверки подписки на канал
async function checkSubscription(userId) {
    try {
        const member = await bot.getChatMember(`@${CHANNEL_USERNAME}`, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
        console.log('Ошибка проверки подписки:', error.message);
        return false;
    }
}

// Функция получения случайного ключа
function getRandomKey(callback) {
    db.get("SELECT * FROM keys WHERE is_used = 0 ORDER BY RANDOM() LIMIT 1", callback);
}

// Функция отметки ключа как использованного
function markKeyAsUsed(keyId, userId, gameKey, callback) {
    db.run("UPDATE keys SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?", 
           [userId, keyId], callback);
}

// Функция добавления пользователя
function addUser(user, callback) {
    db.run(`INSERT OR IGNORE INTO users (user_id, username, first_name, last_name) 
            VALUES (?, ?, ?, ?)`, 
           [user.id, user.username, user.first_name, user.last_name], callback);
}

// Функция проверки, получал ли пользователь ключ
function hasUserReceivedKey(userId, callback) {
    db.get("SELECT has_key FROM users WHERE user_id = ?", [userId], callback);
}

// Функция отметки, что пользователь получил ключ
function markUserAsKeyReceived(userId, gameKey, callback) {
    db.run("UPDATE users SET has_key = 1, key_received = ? WHERE user_id = ?", 
           [gameKey, userId], callback);
}

// Функции для партнерских ключей
function getRandomPartnerKey(callback) {
    db.get("SELECT * FROM partner_keys WHERE is_used = 0 ORDER BY RANDOM() LIMIT 1", callback);
}

function markPartnerKeyAsUsed(keyId, userId, gameKey, callback) {
    db.run("UPDATE partner_keys SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?", 
           [userId, keyId], callback);
}

// Функции рассылки
function getAllUsers(callback) {
    db.all("SELECT user_id, username, first_name FROM users", callback);
}

function sendBroadcast(messageText, imageBuffer = null, adminId, callback) {
    getAllUsers((err, users) => {
        if (err) {
            callback(err, null);
            return;
        }

        let sent = 0;
        let errors = 0;
        const total = users.length;

        if (total === 0) {
            callback(null, { sent: 0, errors: 0, total: 0 });
            return;
        }

        users.forEach((user, index) => {
            setTimeout(() => {
                const sendMessage = () => {
                    if (imageBuffer) {
                        bot.sendPhoto(user.user_id, imageBuffer, {
                            caption: messageText,
                            parse_mode: 'Markdown',
                            filename: 'broadcast_image.jpg',
                            contentType: 'image/jpeg'
                        }).then(() => {
                            sent++;
                        }).catch((error) => {
                            errors++;
                            if (!error.message.includes('user is deactivated') && 
                                !error.message.includes('bot was blocked') &&
                                !error.message.includes('user not found')) {
                                console.error(`Ошибка рассылки пользователю ${user.user_id}:`, error.message);
                            }
                        }).finally(() => {
                            if (index === total - 1) {
                                callback(null, { sent, errors, total });
                            }
                        });
                    } else {
                        bot.sendMessage(user.user_id, messageText, {
                            parse_mode: 'Markdown'
                        }).then(() => {
                            sent++;
                        }).catch((error) => {
                            errors++;
                            if (!error.message.includes('user is deactivated') && 
                                !error.message.includes('bot was blocked') &&
                                !error.message.includes('user not found')) {
                                console.error(`Ошибка рассылки пользователю ${user.user_id}:`, error.message);
                            }
                        }).finally(() => {
                            if (index === total - 1) {
                                callback(null, { sent, errors, total });
                            }
                        });
                    }
                };

                sendMessage();
            }, index * 100); // Задержка 100мс между сообщениями
        });
    });
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    // Добавляем пользователя в базу
    addUser(user, (err) => {
        if (err) {
            console.log('Ошибка добавления пользователя:', err);
        }
    });
    
    // Проверяем, проходил ли пользователь капчу
    db.get("SELECT verified FROM captcha WHERE user_id = ?", [user.id], (err, row) => {
        if (err) {
            console.log('Ошибка проверки капчи:', err);
            return;
        }
        
        if (!row || row.verified === 0) {
            // Генерируем капчу
            const captcha = generateCaptcha();
            const captchaImage = createCaptchaImage(captcha.question);
            
            // Сохраняем капчу в базу
            db.run("INSERT OR REPLACE INTO captcha (user_id, answer, verified) VALUES (?, ?, 0)", 
                   [user.id, captcha.answer], (err) => {
                if (err) {
                    console.log('Ошибка сохранения капчи:', err);
                }
            });
            
            bot.sendPhoto(chatId, captchaImage, {
                caption: `🔐 Привет! Для защиты от ботов, пожалуйста, решите простой пример:\n\nОтправьте ответ числом.`,
                filename: 'captcha.png',
                contentType: 'image/png'
            });
        } else {
            showMainMenu(chatId);
        }
    });
});

// Функция показа главного меню
function showMainMenu(chatId) {
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎮 Получить бесплатный ключ Zenith DLC', callback_data: 'get_key' }],
                [{ text: '📺 Стать медиа партнером', callback_data: 'media_partner' }],
                [{ text: '🐛 Сообщить о проблеме', callback_data: 'bug_report' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, 
        `🎮 Добро пожаловать в бот для получения бесплатных ключей Zenith DLC!\n\n` +
        `📋 Условия получения:\n` +
        `• Подписка на канал ${CHANNEL_URL}\n` +
        `• Один ключ на одного пользователя\n\n` +
        `📺 Создатели контента могут подать заявку на медиа партнерство!\n\n` +
        `Нажмите кнопку ниже, чтобы получить ключ:`, 
        keyboard
    );
}

// Обработчик текстовых сообщений (для капчи и рассылки)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Логируем сообщения от админа для дебага
    if (userId === ADMIN_ID && text && !text.startsWith('/')) {
        console.log(`� ADMIN TEXT: "${text}" from chat: ${chatId}`);
    }
    
    // Проверяем команду отмены рассылки
    if (text === '/cancel' && broadcastState.has(userId)) {
        broadcastState.delete(userId);
        bot.sendMessage(chatId, '❌ Рассылка отменена');
        return;
    }
    
    // Проверяем команду отмены загрузки ключей
    if (text === '/cancel' && keyUploadState.has(userId)) {
        keyUploadState.delete(userId);
        bot.sendMessage(chatId, '❌ Загрузка ключей отменена');
        return;
    }
    
    // Проверяем команду отмены баг репорта
    if (text === '/cancel' && bugReportState.has(userId)) {
        bugReportState.delete(userId);
        bot.sendMessage(chatId, '❌ Создание баг репорта отменено');
        return;
    }
    
    // Проверяем команду отмены ответа администратора
    if (text === '/cancel' && adminReplyState.has(userId)) {
        adminReplyState.delete(userId);
        bot.sendMessage(chatId, '❌ Ответ отменен');
        return;
    }
    
    // Проверяем команду отмены заявки на медиа партнерство
    if (text === '/cancel' && mediaPartnerState.has(userId)) {
        mediaPartnerState.delete(userId);
        bot.sendMessage(chatId, '❌ Подача заявки на медиа партнерство отменена');
        return;
    }
    
    // Проверяем команду отмены обработки заявки администратором
    if (text === '/cancel' && adminPartnerState.has(userId)) {
        adminPartnerState.delete(userId);
        bot.sendMessage(chatId, '❌ Обработка заявки отменена');
        return;
    }
    
    // Обработка ответа администратора
    if (adminReplyState.has(userId) && userId === ADMIN_ID) {
        const replyData = adminReplyState.get(userId);
        const targetUserId = replyData.targetUserId;
        
        // Отправляем ответ пользователю
        const replyMessage = 
            `💬 ОТВЕТ ОТ ПОДДЕРЖКИ\n\n` +
            `${text}\n\n` +
            `📞 Если у вас остались вопросы, создайте новый баг репорт через бота.`;
        
        bot.sendMessage(targetUserId, replyMessage).then(() => {
            // Подтверждаем администратору
            bot.sendMessage(chatId, 
                `✅ Ответ отправлен пользователю ID: ${targetUserId}\n\n` +
                `📤 Отправленное сообщение:\n${text}`
            );
            adminReplyState.delete(userId);
        }).catch(err => {
            bot.sendMessage(chatId, `❌ Ошибка отправки ответа пользователю ${targetUserId}: ${err.message}`);
            adminReplyState.delete(userId);
        });
        return;
    }
    
    // Обработка заявок на медиа партнерство
    if (mediaPartnerState.has(userId)) {
        const state = mediaPartnerState.get(userId);
        
        if (state.step === 'waiting_channel') {
            // Получили ссылку на канал
            mediaPartnerState.set(userId, {
                ...state,
                step: 'waiting_subscribers',
                channel: text
            });
            
            bot.sendMessage(chatId, 
                `📊 Отлично! Сколько у вас подписчиков?\n\n` +
                `💡 Примеры: 1000, 5.5к, 100к, 1млн\n\n` +
                `📝 Не переживайте, если подписчиков мало - главное качество контента!\n\n` +
                `❌ Отправьте /cancel для отмены`
            );
            return;
        } else if (state.step === 'waiting_subscribers') {
            // Получили количество подписчиков
            mediaPartnerState.set(userId, {
                ...state,
                step: 'waiting_about',
                subscribers: text
            });
            
            bot.sendMessage(chatId, 
                `✍️ Расскажите коротко о себе:\n\n` +
                `💡 Можете написать:\n` +
                `• Какой контент делаете\n` +
                `• Как давно ведёте канал\n` +
                `• Планы по Zenith DLC\n\n` +
                `📝 Пару предложений хватит!\n\n` +
                `❌ Отправьте /cancel для отмены`
            );
            return;
        } else if (state.step === 'waiting_about') {
            // Получили информацию о себе
            mediaPartnerState.set(userId, {
                ...state,
                step: 'confirm',
                about: text
            });
            
            const platformText = state.type === 'tiktok' ? '📱 TikTok' : '🎬 YouTube';
            
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Подать заявку', callback_data: 'partner_submit' },
                            { text: '❌ Отменить', callback_data: 'partner_cancel' }
                        ]
                    ]
                }
            };
            
            bot.sendMessage(chatId, 
                `📋 Проверьте ваши данные:\n\n` +
                `📺 Платформа: ${platformText}\n` +
                `🔗 Канал: ${state.channel}\n` +
                `📊 Подписчики: ${state.subscribers}\n` +
                `✍️ О себе: ${(state.about || '').substring(0, 80)}${(state.about || '').length > 80 ? '...' : ''}\n\n` +
                `� **Что вы получите:**\n` +
                `• 🎮 Эксклюзивный ключ для обзора\n` +
                `• 💰 Оплата за просмотры:\n` +
                `  - 105₽ за 1К просмотров (до 5К)\n` +
                `  - 75₽ за 1К просмотров (свыше 5К)\n` +
                `• 🧪 Доступ к бета-версии\n` +
                `• 👥 Чат с другими партнёрами\n\n` +
                `🚀 Готовы начать сотрудничество?`,
                { ...keyboard, parse_mode: 'Markdown' }
            );
            return;
        }
    }
    
    // Обработка администратором заявок на партнерство
    if (adminPartnerState.has(userId) && userId === ADMIN_ID) {
        const adminState = adminPartnerState.get(userId);
        console.log(`📝 АДМИН: Получено сообщение от админа: "${text}"`);
        console.log(`📊 АДМИН: Текущее состояние:`, adminState);
        
        if (adminState.step === 'waiting_payment_amount') {
            console.log(`💰 АДМИН: Обрабатываем сумму оплаты: "${text}"`);
            // Получили сумму оплаты
            const amount = text.trim();
            
            // Проверяем, что сумма не пустая и больше 0
            if (!amount || amount === '0' || isNaN(amount) || parseFloat(amount) <= 0) {
                console.log(`❌ АДМИН: Некорректная сумма: "${amount}"`);
                bot.sendMessage(chatId, 
                    `❌ Некорректная сумма оплаты!\n\n` +
                    `💡 Введите сумму больше 0 (например: 1000, 1500, 2000)\n` +
                    `❌ Отправьте /cancel для отмены`
                );
                return;
            }
            
            console.log(`✅ АДМИН: Сумма корректна: ${amount}, одобряем заявку ID: ${adminState.applicationId}`);
            // Одобряем заявку как платную
            db.run(
                "UPDATE media_partner_applications SET status = 'approved_paid', payment_amount = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [amount, adminState.applicationId],
                (err) => {
                    if (err) {
                        bot.sendMessage(chatId, '❌ Ошибка обновления заявки');
                        return;
                    }
                    
                    // Получаем данные заявки для отправки пользователю
                    db.get("SELECT * FROM media_partner_applications WHERE id = ?", [adminState.applicationId], (err, app) => {
                        if (err || !app) {
                            bot.sendMessage(chatId, '❌ Ошибка получения данных заявки');
                            return;
                        }
                        
                        // Получаем партнерский ключ
                        getRandomPartnerKey((err, keyRow) => {
                            if (err || !keyRow) {
                                bot.sendMessage(chatId, '❌ Нет доступных партнерских ключей!');
                                return;
                            }
                            
                            // Отмечаем ключ как использованный
                            markPartnerKeyAsUsed(keyRow.id, app.user_id, keyRow.game_key, () => {
                                // Обновляем заявку с ключом
                                db.run("UPDATE media_partner_applications SET partner_key = ? WHERE id = ?", 
                                       [keyRow.game_key, adminState.applicationId]);
                                
                                // Отправляем поздравление пользователю
                                const platformText = app.platform_type === 'tiktok' ? 'TikTok' : 'YouTube';
                                
                                const paymentKeyboard = {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [
                                                { text: '💰 Криптобот', callback_data: 'payment_crypto' },
                                                { text: '🏦 СБП', callback_data: 'payment_sbp' },
                                                { text: '🎯 FanPay', callback_data: 'payment_fanpay' }
                                            ]
                                        ]
                                    }
                                };
                                
                                bot.sendMessage(app.user_id, 
                                    `🎉 ПОЗДРАВЛЯЕМ! Ваша заявка одобрена!\n\n` +
                                    `📺 Платформа: ${platformText}\n` +
                                    `💰 Ставка: ${amount}₽ за 1К просмотров\n` +
                                    `🎮 Ваш ключ: \`${keyRow.game_key}\`\n\n` +
                                    `🔗 Чаты для партнёров:\n` +
                                    `🧪 Бета-тест: ${BETA_CHAT_PAID}\n` +
                                    `📺 Общий чат: ${YT_CHAT}\n\n` +
                                    `💳 Выберите способ получения выплат:`,
                                    { parse_mode: 'Markdown', ...paymentKeyboard }
                                );
                                
                                // Подтверждаем админу
                                bot.sendMessage(chatId, `✅ Заявка одобрена как платная (${amount}₽ за 1К просмотров)`);
                                adminPartnerState.delete(userId);
                            });
                        });
                    });
                }
            );
            return;
        } else if (adminState.step === 'waiting_sbp_details') {
            // Получили данные СБП
            const paymentDetails = text;
            
            // Сохраняем данные оплаты
            db.run(
                "UPDATE media_partner_applications SET payment_type = 'sbp', payment_details = ? WHERE id = ?",
                [paymentDetails, adminState.applicationId],
                (err) => {
                    adminPartnerState.delete(userId);
                    
                    if (err) {
                        bot.sendMessage(chatId, '❌ Ошибка сохранения данных оплаты');
                        return;
                    }
                    
                    bot.sendMessage(chatId, 
                        `✅ Данные для оплаты сохранены!\n\n` +
                        `📱 СБП: ${paymentDetails}\n\n` +
                        `💰 Ожидайте первую оплату после выхода видео!`
                    );
                }
            );
            return;
        }
    }
    
    // Обработка загрузки файла с ключами для админа
    if (userId === ADMIN_ID && keyUploadState.has(userId)) {
        const state = keyUploadState.get(userId);
        
        if (state.waiting_file && msg.document) {
            const file = msg.document;
            
            // Проверяем, что это текстовый файл
            if (!file.file_name.endsWith('.txt') && file.mime_type !== 'text/plain') {
                bot.sendMessage(chatId, '❌ Пожалуйста, отправьте .txt файл');
                return;
            }
            
            // Проверяем размер файла (максимум 1 МБ)
            if (file.file_size > 1024 * 1024) {
                bot.sendMessage(chatId, '❌ Файл слишком большой. Максимум 1 МБ');
                return;
            }
            
            bot.sendMessage(chatId, '📥 Загружаю файл...');
            
            // Скачиваем и обрабатываем файл
            bot.getFile(file.file_id).then(fileInfo => {
                const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
                
                https.get(fileUrl, (response) => {
                    let data = '';
                    response.setEncoding('utf8');
                    
                    response.on('data', chunk => {
                        data += chunk;
                    });
                    
                    response.on('end', () => {
                        // Обрабатываем содержимое файла
                        const keys = data.split('\n')
                            .map(key => key.trim())
                            .filter(key => key.length > 0);
                        
                        if (keys.length === 0) {
                            bot.sendMessage(chatId, '❌ Файл пустой или не содержит ключей');
                            keyUploadState.delete(userId);
                            return;
                        }
                        
                        if (keys.length > 1000) {
                            bot.sendMessage(chatId, '❌ Слишком много ключей. Максимум 1000 за раз');
                            keyUploadState.delete(userId);
                            return;
                        }
                        
                        keyUploadState.delete(userId);
                        bot.sendMessage(chatId, `📁 Найдено ${keys.length} ключей в файле`);
                        
                        // Обрабатываем ключи
                        processKeys(keys, chatId);
                    });
                    
                    response.on('error', (err) => {
                        bot.sendMessage(chatId, '❌ Ошибка загрузки файла');
                        keyUploadState.delete(userId);
                    });
                });
            }).catch(err => {
                bot.sendMessage(chatId, '❌ Ошибка получения файла');
                keyUploadState.delete(userId);
            });
            
            return;
        }
    }
    
    // Обработка баг репортов
    if (bugReportState.has(userId)) {
        const state = bugReportState.get(userId);
        
        if (state.step === 'waiting_description') {
            if (text) {
                // Сохраняем описание проблемы
                bugReportState.set(userId, {
                    ...state,
                    step: 'waiting_media',
                    description: text
                });
                
                bot.sendMessage(chatId, 
                    `📹 Отправьте видео или скриншот проблемы\n\n` +
                    `💡 Это поможет нашим разработчикам лучше понять проблему\n\n` +
                    `⏭️ Или отправьте /skip чтобы пропустить\n` +
                    `❌ Отправьте /cancel для отмены`
                );
            }
            return;
        } else if (state.step === 'waiting_media') {
            // Получили медиа или команду skip
            if (text === '/skip') {
                // Отправляем репорт без медиа
                sendBugReport(userId, state, null);
                return;
            } else if (msg.video || msg.photo || msg.document) {
                // Отправляем репорт с медиа
                sendBugReport(userId, state, msg);
                return;
            } else {
                bot.sendMessage(chatId, 
                    `📹 Пожалуйста, отправьте видео, фото или документ\n` +
                    `Или напишите /skip чтобы пропустить`
                );
            }
            return;
        }
    }
    
    // Обработка рассылки для админа
    if (userId === ADMIN_ID && broadcastState.has(userId)) {
        const state = broadcastState.get(userId);
        
        if (state.step === 'waiting_message') {
            if (msg.photo) {
                // Сообщение с изображением
                const photo = msg.photo[msg.photo.length - 1]; // Берем самое большое изображение
                const caption = msg.caption || '';
                
                bot.getFile(photo.file_id).then(file => {
                    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
                    
                    // Скачиваем изображение
                    https.get(fileUrl, (response) => {
                        let data = [];
                        response.on('data', chunk => data.push(chunk));
                        response.on('end', () => {
                            const imageBuffer = Buffer.concat(data);
                            
                            // Подтверждение рассылки
                            broadcastState.set(userId, { 
                                step: 'confirm', 
                                message: caption, 
                                image: imageBuffer 
                            });
                            
                            const keyboard = {
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: '✅ Отправить', callback_data: 'broadcast_confirm' },
                                            { text: '❌ Отменить', callback_data: 'broadcast_cancel' }
                                        ]
                                    ]
                                }
                            };
                            
                            bot.sendPhoto(chatId, imageBuffer, {
                                caption: `📢 Предварительный просмотр рассылки:\n\n${caption}\n\n📊 Будет отправлено всем пользователям бота.`,
                                reply_markup: keyboard.reply_markup,
                                parse_mode: 'Markdown',
                                filename: 'broadcast_preview.jpg',
                                contentType: 'image/jpeg'
                            });
                        });
                    });
                });
            } else if (text) {
                // Текстовое сообщение
                broadcastState.set(userId, { 
                    step: 'confirm', 
                    message: text 
                });
                
                const keyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Отправить', callback_data: 'broadcast_confirm' },
                                { text: '❌ Отменить', callback_data: 'broadcast_cancel' }
                            ]
                        ]
                    }
                };
                
                bot.sendMessage(chatId, 
                    `📢 Предварительный просмотр рассылки:\n\n${text}\n\n📊 Будет отправлено всем пользователям бота.`,
                    {
                        reply_markup: keyboard.reply_markup,
                        parse_mode: 'Markdown'
                    }
                );
            }
        }
        return;
    }
    
    // Пропускаем команды
    if (text && text.startsWith('/')) {
        return;
    }
    
    // Проверяем, ожидается ли ответ на капчу
    db.get("SELECT answer, verified FROM captcha WHERE user_id = ?", [userId], (err, row) => {
        if (err) {
            console.log('Ошибка проверки капчи:', err);
            return;
        }
        
        if (row && row.verified === 0) {
            const userAnswer = parseInt(text);
            
            if (userAnswer === row.answer) {
                // Правильный ответ
                db.run("UPDATE captcha SET verified = 1 WHERE user_id = ?", [userId], (err) => {
                    if (err) {
                        console.log('Ошибка обновления капчи:', err);
                        return;
                    }
                    
                    bot.sendMessage(chatId, '✅ Капча пройдена успешно!');
                    setTimeout(() => {
                        showMainMenu(chatId);
                    }, 1000);
                });
            } else {
                // Неправильный ответ - генерируем новую капчу
                const captcha = generateCaptcha();
                const captchaImage = createCaptchaImage(captcha.question);
                
                db.run("UPDATE captcha SET answer = ? WHERE user_id = ?", 
                       [captcha.answer, userId], (err) => {
                    if (err) {
                        console.log('Ошибка обновления капчи:', err);
                        return;
                    }
                    
                    bot.sendPhoto(chatId, captchaImage, {
                        caption: `❌ Неправильный ответ. Попробуйте еще раз:\n\nОтправьте ответ числом.`,
                        filename: 'captcha.png',
                        contentType: 'image/png'
                    });
                });
            }
        }
    });
});

// Обработчик нажатий на кнопки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // Глобальная проверка на админа для админских колбеков
    // Разрешаем обычным пользователям partner_ (кроме partner_free_ и partner_paid_)
    console.log(`🔍 CALLBACK: User ${userId} (ADMIN: ${ADMIN_ID}) trying to use: ${data} in chat: ${chatId}`);
    
    if (
        data.startsWith('admin_') ||
        data.startsWith('reply_') ||
        (data.startsWith('partner_free_') || data.startsWith('partner_paid_'))
    ) {
        if (userId !== ADMIN_ID) {
            console.log(`❌ ACCESS DENIED: User ${userId} is not admin (${ADMIN_ID})`);
            safeAnswerCallbackQuery(query.id, '❌ Доступ запрещен!');
            return;
        } else {
            console.log(`✅ ACCESS GRANTED: Admin ${userId} using ${data}`);
        }
    }
    
    // Особая проверка для app_ колбеков - разрешаем только админу и только в медиа чате
    if (data.startsWith('app_')) {
        if (userId !== ADMIN_ID || chatId !== MEDIA_PARTNER_CHAT_ID) {
            console.log(`❌ APP ACCESS DENIED: User ${userId} (need admin: ${ADMIN_ID}) in chat ${chatId} (need: ${MEDIA_PARTNER_CHAT_ID})`);
            safeAnswerCallbackQuery(query.id, '❌ Доступ запрещен! Только админ в медиа чате.');
            return;
        } else {
            console.log(`✅ APP ACCESS GRANTED: Admin ${userId} in media chat using ${data}`);
        }
    }
    
    // Обработка пользовательских команд
    if (data === 'get_key') {
        // ЗАЩИТА ОТ СПАМА: проверяем активные запросы
        if (activeKeyRequests.has(userId)) {
            safeAnswerCallbackQuery(query.id, '⏳ Обработка запроса... Подождите!');
            return;
        }
        
        // Добавляем пользователя в активные запросы
        activeKeyRequests.add(userId);
        
        // Проверяем, получал ли пользователь уже ключ
        hasUserReceivedKey(userId, async (err, row) => {
            if (err) {
                activeKeyRequests.delete(userId); // Убираем из активных
                safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных');
                return;
            }
            
            if (row && row.has_key === 1) {
                activeKeyRequests.delete(userId); // Убираем из активных
                safeAnswerCallbackQuery(query.id, '❌ Вы уже получили ключ!');
                return;
            }
            
            // Проверяем подписку на канал
            const isSubscribed = await checkSubscription(userId);
            
            if (!isSubscribed) {
                activeKeyRequests.delete(userId); // Убираем из активных
                const keyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📢 Подписаться на канал', url: CHANNEL_URL }],
                            [{ text: '✅ Я подписался', callback_data: 'check_subscription' }]
                        ]
                    }
                };
                
                safeEditMessage(chatId, query.message.message_id,
                    `📢 Для получения ключа необходимо подписаться на наш канал!\n\n` +
                    `Канал: ${CHANNEL_URL}\n\n` +
                    `После подписки нажмите кнопку "Я подписался"`,
                    {
                        reply_markup: keyboard.reply_markup
                    }
                );
            } else {
                // Пользователь подписан, выдаем ключ
                giveKeyToUser(chatId, userId, query);
            }
        });
    } else if (data === 'check_subscription') {
        // ЗАЩИТА ОТ СПАМА: проверяем активные запросы
        if (activeKeyRequests.has(userId)) {
            safeAnswerCallbackQuery(query.id, '⏳ Обработка запроса... Подождите!');
            return;
        }
        
        // Добавляем пользователя в активные запросы
        activeKeyRequests.add(userId);
        
        const isSubscribed = await checkSubscription(userId);
        
        if (isSubscribed) {
            giveKeyToUser(chatId, userId, query);
        } else {
            activeKeyRequests.delete(userId); // Убираем из активных
            safeAnswerCallbackQuery(query.id, '❌ Вы еще не подписались на канал!');
        }
    }
    // Обработка админских команд
    else if (data.startsWith('admin_')) {
        if (data === 'admin_stats') {
            // Статистика
            db.get("SELECT COUNT(*) as total_users FROM users", (err, userCount) => {
                if (err) {
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных');
                    return;
                }
                
                db.get("SELECT COUNT(*) as total_keys FROM keys", (err, totalKeys) => {
                    db.get("SELECT COUNT(*) as used_keys FROM keys WHERE is_used = 1", (err, usedKeys) => {
                        db.get("SELECT COUNT(*) as users_with_keys FROM users WHERE has_key = 1", (err, usersWithKeys) => {
                            const availableKeys = totalKeys.total_keys - usedKeys.used_keys;
                            
                            safeEditMessage(chatId, query.message.message_id,
                                `📊 Статистика бота:\n\n` +
                                `👥 Всего пользователей: ${userCount.total_users}\n` +
                                `🎮 Пользователей с ключами: ${usersWithKeys.users_with_keys}\n` +
                                `🔑 Всего ключей: ${totalKeys.total_keys}\n` +
                                `✅ Выдано ключей: ${usedKeys.used_keys}\n` +
                                `📦 Доступно ключей: ${availableKeys}`
                            );
                        });
                    });
                });
            });
        } else if (data === 'admin_add_keys') {
            bot.editMessageText(
                `🔑 Добавление ключей\n\n` +
                `📝 Выберите способ добавления:\n\n` +
                `**Способ 1 - Файл (рекомендуется):**\n` +
                `1. Отправьте команду \`/addkeys\`\n` +
                `2. Загрузите .txt файл с ключами\n` +
                `3. Каждый ключ на отдельной строке\n\n` +
                `**Способ 2 - Через пробелы:**\n` +
                `/addkeys КЛЮЧ1 КЛЮЧ2 КЛЮЧ3\n\n` +
                `**Способ 3 - Один ключ:**\n` +
                `/addkey ВАШКЛЮЧ\n\n` +
                `📄 Файл: до 1000 ключей, макс. 1 МБ\n` +
                `💡 Формат файла: только .txt`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
        } else if (data === 'admin_broadcast') {
            // Начинаем процесс рассылки
            broadcastState.set(userId, { step: 'waiting_message' });
            bot.editMessageText(
                `📢 Создание рассылки\n\n` +
                `📝 Отправьте текст сообщения для рассылки.\n\n` +
                `💡 Поддерживается Markdown форматирование:\n` +
                `• *жирный текст*\n` +
                `• _курсив_\n` +
                `• \`код\`\n` +
                `• [ссылка](http://example.com)\n\n` +
                `📷 Вы также можете отправить изображение с подписью.\n\n` +
                `❌ Отправьте /cancel для отмены`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
        } else if (data === 'admin_users') {
            // Показать статистику пользователей
            db.get("SELECT COUNT(*) as total_users FROM users", (err, userCount) => {
                if (err) {
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных');
                    return;
                }
                
                db.get("SELECT COUNT(*) as users_with_keys FROM users WHERE has_key = 1", (err, usersWithKeys) => {
                    db.get("SELECT COUNT(*) as verified_users FROM captcha WHERE verified = 1", (err, verifiedUsers) => {
                        bot.editMessageText(
                            `👥 Статистика пользователей:\n\n` +
                            `📊 Всего пользователей: ${userCount.total_users}\n` +
                            `✅ Прошли капчу: ${verifiedUsers ? verifiedUsers.verified_users : 0}\n` +
                            `🎮 Получили ключи: ${usersWithKeys.users_with_keys}\n` +
                            `📝 Без ключей: ${userCount.total_users - usersWithKeys.users_with_keys}`,
                            {
                                chat_id: chatId,
                                message_id: query.message.message_id
                            }
                        );
                    });
                });
            });
        }
    } else if (data === 'broadcast_confirm') {
        // Подтверждение рассылки
        const state = broadcastState.get(userId);
        if (!state || state.step !== 'confirm') {
            safeAnswerCallbackQuery(query.id, '❌ Ошибка состояния рассылки');
            return;
        }
        
        bot.editMessageText('🚀 Начинаю рассылку...', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        
        // Запускаем рассылку
        sendBroadcast(state.message, state.image || null, userId, (err, result) => {
            broadcastState.delete(userId);
            
            if (err) {
                bot.sendMessage(chatId, `❌ Ошибка рассылки: ${err.message}`);
                return;
            }
            
            bot.sendMessage(chatId, 
                `📊 Рассылка завершена!\n\n` +
                `✅ Отправлено: ${result.sent}\n` +
                `❌ Ошибок: ${result.errors}\n` +
                `📝 Всего пользователей: ${result.total}`
            );
        });
    } else if (data === 'broadcast_cancel') {
        // Отмена рассылки
        broadcastState.delete(userId);
        bot.editMessageText('❌ Рассылка отменена', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    } else if (data === 'bug_report') {
        // Начало создания баг репорта
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Лоадер', callback_data: 'bug_type_loader' },
                        { text: '🎮 Чит', callback_data: 'bug_type_cheat' }
                    ],
                    [{ text: '❌ Отменить', callback_data: 'bug_cancel' }]
                ]
            }
        };
        
        bot.editMessageText(
            `🐛 Создание баг репорта\n\n` +
            `📂 Выберите тип проблемы:\n\n` +
            `🔄 **Лоадер** - проблемы с запуском, загрузкой\n` +
            `🎮 **Чит** - проблемы с функциями, багами в игре\n\n` +
            `💡 Это поможет направить ваш репорт нужным разработчикам`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            }
        );
    } else if (data === 'bug_type_loader' || data === 'bug_type_cheat') {
        // Выбран тип проблемы
        const type = data === 'bug_type_loader' ? 'loader' : 'cheat';
        bugReportState.set(userId, { step: 'waiting_description', type: type });
        
        bot.editMessageText(
            `🐛 Баг репорт: ${type === 'loader' ? '🔄 Лоадер' : '🎮 Чит'}\n\n` +
            `📝 Опишите проблему подробно:\n\n` +
            `💡 Укажите:\n` +
            `• Что именно не работает\n` +
            `• Когда проблема возникает\n` +
            `• Что вы делали перед этим\n` +
            `• Сообщения об ошибках (если есть)\n\n` +
            `❌ Отправьте /cancel для отмены`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            }
        );
    } else if (data === 'bug_cancel') {
        // Отмена баг репорта
        bugReportState.delete(userId);
        showMainMenu(chatId);
    } else if (data.startsWith('admin_')) {
        // Если это админская команда, но пользователь не админ
        safeAnswerCallbackQuery(query.id, '❌ Доступ запрещен!');
    } else if (data.startsWith('bug_type_')) {
        // Выбор типа бага
        const type = data === 'bug_type_loader' ? 'loader' : 'cheat';
        bugReportState.set(userId, { step: 'waiting_description', type: type });
        
        bot.editMessageText(
            `🐛 Баг репорт: ${type === 'loader' ? '🔄 Лоадер' : '🎮 Чит'}\n\n` +
            `📝 Опишите проблему подробно:\n\n` +
            `💡 Укажите:\n` +
            `• Что именно не работает\n` +
            `• Когда проблема возникает\n` +
            `• Что вы делали перед этим\n` +
            `• Сообщения об ошибках (если есть)\n\n` +
            `❌ Отправьте /cancel для отмены`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            }
        );
    } else if (data === 'bug_cancel') {
        // Отмена баг репорта
        bugReportState.delete(userId);
        showMainMenu(chatId);
    } else if (data.startsWith('reply_')) {
        // Ответ администратора на баг репорт
        const targetUserId = parseInt(data.replace('reply_', ''));
        
        // Проверяем, что это админ И мы в чате поддержки
        if (userId === ADMIN_ID || chatId === SUPPORT_CHAT_ID) {
            adminReplyState.set(userId, { waitingReply: true, targetUserId: targetUserId });
            
            // Отправляем ответ администратору в личные сообщения
            bot.sendMessage(userId, 
                `💬 Ответ пользователю ID: ${targetUserId}\n\n` +
                `📝 Напишите ваш ответ следующим сообщением в этом чате.\n` +
                `Ответ будет отправлен пользователю в личные сообщения бота.\n\n` +
                `❌ Отправьте /cancel для отмены`,
                { parse_mode: 'Markdown' }
            ).then(() => {
                safeAnswerCallbackQuery(query.id, '✅ Режим ответа активирован! Проверьте личные сообщения.');
            }).catch(() => {
                // Если не удалось отправить в ЛС, редактируем сообщение в группе
                bot.editMessageText(
                    `💬 Ответ пользователю ID: ${targetUserId}\n\n` +
                    `📝 Напишите ваш ответ следующим сообщением в этот чат.\n` +
                    `Ответ будет отправлен пользователю в личные сообщения бота.\n\n` +
                    `❌ Отправьте /cancel для отмены`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
                safeAnswerCallbackQuery(query.id, '✅ Режим ответа активирован!');
            });
        } else {
            safeAnswerCallbackQuery(query.id, '❌ Только администратор может отвечать!');
        }
    } else if (data === 'media_partner') {
        // Проверяем, не подавал ли пользователь уже заявку
        db.get("SELECT id, status FROM media_partner_applications WHERE user_id = ?", [userId], (err, existingApp) => {
            if (err) {
                safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных');
                return;
            }
            
            if (existingApp) {
                let statusText = '';
                switch(existingApp.status) {
                    case 'pending':
                        statusText = '⏳ На рассмотрении';
                        break;
                    case 'approved_free':
                        statusText = '✅ Одобрена (бесплатное партнерство)';
                        break;
                    case 'approved_paid':
                        statusText = '✅ Одобрена (платное партнерство)';
                        break;
                    case 'rejected':
                        statusText = '❌ Отклонена';
                        break;
                }
                
                safeEditMessage(chatId, query.message.message_id,
                    `📺 Статус вашей заявки на медиа партнерство:\n\n` +
                    `${statusText}\n\n` +
                    `📋 Вы можете подать только одну заявку.\n` +
                    `Если ваша заявка была отклонена, обратитесь к администратору для повторной подачи.`
                );
                return;
            }
            
            // Если заявки нет - показываем форму подачи
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📱 TikTok', callback_data: 'partner_tiktok' },
                            { text: '🎬 YouTube', callback_data: 'partner_youtube' }
                        ],
                        [{ text: '❌ Отменить', callback_data: 'partner_cancel' }]
                    ]
                }
            };
            
            bot.editMessageText(
                `📺 Медиа партнерство\n\n` +
                `🤝 Хотите зарабатывать на обзорах игр?\n\n` +
                `� **Условия оплаты:**\n` +
                `• До 5К просмотров: 105₽ за 1000 👀\n` +
                `• Свыше 5К просмотров: 75₽ за 1000 👀\n\n` +
                `🎮 **Что получите:**\n` +
                `• Эксклюзивный ключ\n` +
                `• Доступ к бета-версии\n` +
                `• Чат с другими блогерами\n\n` +
                `📱 **На какой платформе создаёте контент?**`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                }
            );
        });
    } else if (data === 'partner_tiktok' || data === 'partner_youtube') {
        // Выбор платформы
        const type = data === 'partner_tiktok' ? 'tiktok' : 'youtube';
        const platformText = type === 'tiktok' ? 'TikTok' : 'YouTube';
        
        mediaPartnerState.set(userId, { 
            step: 'waiting_channel', 
            type: type 
        });
        
        bot.editMessageText(
            `📺 Заявка на ${platformText} партнерство\n\n` +
            `🔗 Пришлите ссылку на ваш ${platformText} канал\n\n` +
            `💡 Примеры:\n` +
            type === 'tiktok' 
                ? `• https://tiktok.com/@username\n• @username`
                : `• https://youtube.com/@channelname\n• https://youtube.com/c/channelname`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            }
        );
    } else if (data === 'partner_submit') {
        // Отправка заявки
        const state = mediaPartnerState.get(userId);
        if (!state || state.step !== 'confirm') {
            safeAnswerCallbackQuery(query.id, '❌ Ошибка состояния заявки');
            return;
        }
        
        const user = query.from;
        
        // Сохраняем заявку в базу данных
        db.run(
            `INSERT INTO media_partner_applications 
             (user_id, username, first_name, last_name, platform_type, channel_link, subscribers_count, about_info) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.username, user.first_name, user.last_name, state.type, state.channel, state.subscribers, state.about],
            function(err) {
                if (err) {
                    bot.editMessageText('❌ Ошибка отправки заявки. Попробуйте позже.', {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });
                    return;
                }
                
                const applicationId = this.lastID;
                
                // Отправляем заявку администраторам
                const platformText = state.type === 'tiktok' ? '📱 TikTok' : '🎬 YouTube';
                const userInfo = `👤 ${user.first_name || 'Неизвестно'} ${user.last_name || ''} (@${user.username || 'нет'})`;
                
                const adminKeyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Принять', callback_data: `app_approve_${applicationId}` },
                                { text: '❌ Отклонить', callback_data: `app_reject_${applicationId}` }
                            ]
                        ]
                    }
                };
                
                const adminMessage = 
                    `📺 НОВАЯ ЗАЯВКА НА МЕДИА ПАРТНЕРСТВО\n\n` +
                    `${userInfo}\n` +
                    `🆔 ID: ${user.id}\n` +
                    `📺 Платформа: ${platformText}\n` +
                    `🔗 Канал: ${state.channel}\n` +
                    `📊 Подписчики: ${state.subscribers}\n` +
                    `✍️ О себе: ${state.about}\n\n` +
                    `🕐 Время: ${new Date().toLocaleString('ru-RU', {timeZone: 'Europe/Moscow'})}`;
                
                bot.sendMessage(MEDIA_PARTNER_CHAT_ID, adminMessage, adminKeyboard).then(() => {
                    // Уведомляем пользователя
                    bot.editMessageText(
                        `✅ Заявка отправлена!\n\n` +
                        `📋 Ваша заявка на ${platformText} партнерство отправлена на рассмотрение.\n\n` +
                        `⏰ Обычно рассмотрение занимает 24-48 часов.\n` +
                        `📱 Мы уведомим вас о результате в этом боте.\n\n` +
                        `🙏 Спасибо за интерес к сотрудничеству!`,
                        {
                            chat_id: chatId,
                            message_id: query.message.message_id
                        }
                    );
                    
                    mediaPartnerState.delete(userId);
                }).catch(err => {
                    console.log('Ошибка отправки заявки админам:', err);
                    bot.editMessageText('❌ Ошибка отправки заявки. Попробуйте позже.', {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });
                });
            }
        );
    } else if (data === 'partner_cancel') {
        // Отмена заявки
        mediaPartnerState.delete(userId);
        showMainMenu(chatId);
    } else if (data.startsWith('app_approve_') || data.startsWith('app_reject_')) {
        // Обработка заявки администратором
        const applicationId = parseInt(data.split('_')[2]);
        const action = data.startsWith('app_approve_') ? 'approve' : 'reject';
        console.log(`📝 АДМИН: Обрабатываем заявку ID: ${applicationId}, действие: ${action}`);
        
        if (action === 'approve') {
            // Одобрение - выбор типа партнерства
            console.log(`✅ АДМИН: Одобряем заявку ${applicationId}`);
            adminPartnerState.set(userId, { 
                step: 'choose_partnership_type', 
                applicationId: applicationId 
            });
            
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🆓 Бесплатная основа', callback_data: `partner_free_${applicationId}` },
                            { text: '💰 Платная основа', callback_data: `partner_paid_${applicationId}` }
                        ]
                    ]
                }
            };
            
            safeAnswerCallbackQuery(query.id, '✅ Заявка одобрена! Выберите тип.');
            
            bot.editMessageText(
                `✅ Заявка принята! Выберите тип партнерства:\n\n` +
                `🆓 **Бесплатное** - только ключ и доступ к бета-чату\n` +
                `💰 **С оплатой** - ключ + выплаты за просмотры + чат партнёров`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard.reply_markup
                }
            );
        } else {
            // Отклонение заявки
            console.log(`❌ АДМИН: Отклоняем заявку ${applicationId}`);
            safeAnswerCallbackQuery(query.id, '❌ Заявка отклонена.');
            
            db.run(
                "UPDATE media_partner_applications SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [applicationId],
                (err) => {
                    if (err) {
                        console.error('❌ Ошибка отклонения заявки:', err);
                        return;
                    }
                    
                    console.log(`✅ АДМИН: Заявка ${applicationId} отклонена в БД`);
                    
                    // Получаем данные заявки для уведомления пользователя
                    db.get("SELECT * FROM media_partner_applications WHERE id = ?", [applicationId], (err, app) => {
                        if (!err && app) {
                            bot.sendMessage(app.user_id, 
                                `❌ Ваша заявка на медиа партнерство отклонена.\n\n` +
                                `📋 Возможные причины:\n` +
                                `• Недостаточная аудитория\n` +
                                `• Неподходящий контент\n` +
                                `• Неполная информация\n\n` +
                                `🔄 Вы можете подать новую заявку через некоторое время.`
                            );
                        }
                    });
                    
                    bot.editMessageText('❌ Заявка отклонена', {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });
                }
            );
        }
    } else if (data.startsWith('partner_free_') || data.startsWith('partner_paid_')) {
        // Обработка типа партнерства
        const applicationId = parseInt(data.split('_')[2]);
        const isFree = data.startsWith('partner_free_');
        
        if (isFree) {
            // Бесплатное партнерство
            db.run(
                "UPDATE media_partner_applications SET status = 'approved_free', processed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [applicationId],
                (err) => {
                    if (err) {
                        bot.editMessageText('❌ Ошибка обновления заявки', {
                            chat_id: chatId,
                            message_id: query.message.message_id
                        });
                        return;
                    }
                    
                    // Получаем данные заявки
                    db.get("SELECT * FROM media_partner_applications WHERE id = ?", [applicationId], (err, app) => {
                        if (err || !app) {
                            bot.editMessageText('❌ Ошибка получения данных заявки', {
                                chat_id: chatId,
                                message_id: query.message.message_id
                            });
                            return;
                        }
                        
                        // Получаем партнерский ключ
                        getRandomPartnerKey((err, keyRow) => {
                            if (err || !keyRow) {
                                bot.editMessageText('❌ Нет доступных партнерских ключей!', {
                                    chat_id: chatId,
                                    message_id: query.message.message_id
                                });
                                return;
                            }
                            
                            // Отмечаем ключ как использованный
                            markPartnerKeyAsUsed(keyRow.id, app.user_id, keyRow.game_key, () => {
                                // Обновляем заявку с ключом
                                db.run("UPDATE media_partner_applications SET partner_key = ? WHERE id = ?", 
                                       [keyRow.game_key, applicationId]);
                                
                                // Отправляем поздравление пользователю
                                                const platformText = app.platform_type === 'tiktok' ? 'TikTok' : 'YouTube';
                                                
                                                bot.sendMessage(app.user_id, 
                                                    `🎉 ПОЗДРАВЛЯЕМ! Ваша заявка одобрена!\n\n` +
                                                    `📺 Платформа: ${platformText}\n` +
                                                    `🎮 Ваш ключ: \`${keyRow.game_key}\`\n\n` +
                                                    `🔗 Чаты для партнёров:\n` +
                                                    `🧪 Бета-тест: ${BETA_CHAT_FREE}\n` +
                                                    `📺 Общий чат: ${YT_CHAT}\n\n` +
                                                    `🎬 Создавайте крутой контент!\n` +
                                                    `📱 Не забудьте упомянуть нас в описании.`,
                                                    { parse_mode: 'Markdown' }
                                                );                                // Подтверждаем админу
                                bot.editMessageText('✅ Заявка одобрена как бесплатная', {
                                    chat_id: chatId,
                                    message_id: query.message.message_id
                                });
                            });
                        });
                    });
                }
            );
        } else {
            // Платное партнерство - запрашиваем сумму
            adminPartnerState.set(userId, { 
                step: 'waiting_payment_amount', 
                applicationId: applicationId 
            });
            
            bot.editMessageText(
                `💰 Платное партнерство\n\n` +
                `📝 Укажите ставку оплаты за 1000 просмотров (в рублях).\n\n` +
                `💡 Рекомендуемые ставки:\n` +
                `• 105 - для видео до 5К просмотров\n` +
                `• 75 - для видео свыше 5К просмотров\n\n` +
                `❌ Отправьте /cancel для отмены`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id
                }
            );
        }
    } else if (data === 'payment_crypto') {
        // Выбор криптобота
        db.run(
            "UPDATE media_partner_applications SET payment_type = 'crypto' WHERE user_id = ? AND status LIKE 'approved_%'",
            [userId],
            (err) => {
                if (err) {
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка сохранения');
                    return;
                }
                
                bot.editMessageText(
                    `✅ Способ оплаты сохранен!\n\n` +
                    `💰 Оплата: Криптобот\n\n` +
                    `🚀 Все готово! Начинайте создавать контент.\n` +
                    `💸 Оплата будет произведена после публикации видео.`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    }
                );
            }
        );
    } else if (data === 'payment_sbp') {
        // Выбор СБП
        db.run(
            "UPDATE media_partner_applications SET payment_type = 'sbp' WHERE user_id = ? AND status LIKE 'approved_%'",
            [userId],
            (err) => {
                if (err) {
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка сохранения');
                    return;
                }
                
                bot.editMessageText(
                    `✅ Способ выплат сохранён!\n\n` +
                    `🏦 Оплата: СБП\n\n` +
                    `📱 После публикации видео с обзором напишите админу для получения выплаты.\n` +
                    `💰 Сумма зависит от количества просмотров:\n` +
                    `• До 5К просмотров: 105₽ за 1К\n` +
                    `• Свыше 5К: 75₽ за 1К\n\n` +
                    `🚀 Удачи в создании контента!`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    }
                );
            }
        );
    } else if (data === 'payment_fanpay') {
        // Выбор FanPay
        db.run(
            "UPDATE media_partner_applications SET payment_type = 'fanpay' WHERE user_id = ? AND status LIKE 'approved_%'",
            [userId],
            (err) => {
                if (err) {
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка сохранения');
                    return;
                }
                
                bot.editMessageText(
                    `✅ Способ выплат сохранён!\n\n` +
                    `� Оплата: FanPay\n\n` +
                    `📝 **Как получать выплаты:**\n` +
                    `1. Создайте лот на FanPay с товаром\n` +
                    `2. До 5К просмотров: цена 105₽ за единицу\n` +
                    `3. Свыше 5К: цена 75₽ за единицу\n` +
                    `4. После публикации видео пришлите ссылку на лот админу\n` +
                    `5. Админ купит нужное количество единиц\n\n` +
                    `💡 Количество единиц = количество тысяч просмотров\n\n` +
                    `🚀 Удачи в создании контента!`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            }
        );
    }
});

// Функция выдачи ключа пользователю
function giveKeyToUser(chatId, userId, query) {
    // КРИТИЧЕСКИ ВАЖНО: НЕ используем db.serialize - это создает вложенные транзакции!
    db.run("BEGIN TRANSACTION", (err) => {
        if (err) {
            activeKeyRequests.delete(userId);
            safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных');
            console.log('Ошибка начала транзакции:', err);
            return;
        }
        
        // Атомарно выбираем и обновляем ключ, чтобы избежать гонки состояний
        const selectAndUpdateQuery = `
            UPDATE keys
            SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP
            WHERE id = (
                SELECT id FROM keys
                WHERE is_used = 0
                ORDER BY RANDOM()
                LIMIT 1
            )
            RETURNING id, game_key;
        `;

        db.get(selectAndUpdateQuery, [userId], function(err, keyRow) {
            if (err) {
                db.run("ROLLBACK");
                activeKeyRequests.delete(userId);
                safeAnswerCallbackQuery(query.id, '❌ Ошибка базы данных при поиске ключа');
                console.log('Ошибка выполнения атомарного запроса ключа:', err);
                return;
            }

            if (!keyRow) {
                db.run("ROLLBACK"); // Откатываем - ключей нет
                activeKeyRequests.delete(userId);
                safeAnswerCallbackQuery(query.id, '❌ Ключи закончились!');
                bot.editMessageText(
                    `😔 К сожалению, все ключи закончились!\n\n` +
                    `Следите за обновлениями в нашем канале: ${CHANNEL_URL}`,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    }
                );
                return;
            }

            // Теперь, когда ключ гарантированно наш, обновляем пользователя
            db.run("UPDATE users SET has_key = 1, key_received = ? WHERE user_id = ?", [keyRow.game_key, userId], (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    activeKeyRequests.delete(userId);
                    safeAnswerCallbackQuery(query.id, '❌ Ошибка при обновлении данных пользователя');
                    console.log('Ошибка сохранения ключа пользователю:', err);
                    return;
                }

                // ВСЕ УСПЕШНО - фиксируем транзакцию
                db.run("COMMIT", (err) => {
                    if (err) {
                        db.run("ROLLBACK");
                        activeKeyRequests.delete(userId);
                        safeAnswerCallbackQuery(query.id, '❌ Критическая ошибка при подтверждении транзакции');
                        console.log('Ошибка коммита транзакции:', err);
                        return;
                    }
                    
                    // Успех! Отправляем ключ пользователю
                    safeAnswerCallbackQuery(query.id, '🎉 Ключ успешно получен!');
                    bot.editMessageText(
                        `🎉 Ваш ключ для Zenith DLC:\n\n` +
                        `\`${keyRow.game_key}\`\n\n` +
                        `📋 Скопируйте ключ и активируйте его можно на сайте zenithdlc.fun.\n` +
                        `💡 Этот ключ предназначен только для вас!\n\n` +
                        `Спасибо за подписку на наш канал: ${CHANNEL_URL}`,
                        {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'Markdown'
                        }
                    );
                    
                    // Уведомляем админа о выдаче ключа
                    bot.sendMessage(ADMIN_ID, 
                        `🔑 Выдан ключ!\n\n` +
                        `👤 Пользователь: ${query.from.first_name} (@${query.from.username || 'нет'})\n` +
                        `🆔 ID: ${userId}\n` +
                        `🎮 Ключ: ${keyRow.game_key}`
                    );
                    
                    // ВАЖНО: Убираем пользователя из активных запросов после успешной выдачи
                    activeKeyRequests.delete(userId);
                });
            });
        });
    });
}

// Админ команды
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log(`🔍 ADMIN CHECK: User ${userId} trying /admin, current ADMIN_ID: ${ADMIN_ID}`);
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, `❌ У вас нет прав администратора!\n\n🔍 Ваш ID: ${userId}\n🔑 Нужный ID: ${ADMIN_ID}`);
        return;
    }
    
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
                [{ text: '🔑 Добавить ключи', callback_data: 'admin_add_keys' }],
                [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
                [{ text: '👥 Список пользователей', callback_data: 'admin_users' }]
            ]
        }
    };
    
    bot.sendMessage(chatId, '👑 Панель администратора:', keyboard);
});

// Команда добавления одного ключа
bot.onText(/\/addkey (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ У вас нет прав администратора!');
        return;
    }
    
    const gameKey = match[1].trim();
    
    db.run("INSERT INTO keys (game_key) VALUES (?)", [gameKey], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                bot.sendMessage(chatId, '❌ Этот ключ уже существует в базе данных!');
            } else {
                bot.sendMessage(chatId, '❌ Ошибка добавления ключа: ' + err.message);
            }
            return;
        }
        
        bot.sendMessage(chatId, `✅ Ключ успешно добавлен!\n🔑 ${gameKey}`);
    });
});

// Команда добавления нескольких ключей
bot.onText(/\/addkeys(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ У вас нет прав администратора!');
        return;
    }
    
    const keysText = match[1] ? match[1].trim() : '';
    
    // Если нет текста после команды - запрашиваем файл
    if (!keysText) {
        keyUploadState.set(userId, { waiting_file: true });
        bot.sendMessage(chatId, 
            `📁 Загрузка ключей через файл\n\n` +
            `📄 Отправьте .txt файл с ключами\n` +
            `💡 Каждый ключ должен быть на отдельной строке\n\n` +
            `📋 Пример содержимого файла:\n` +
            `ZENITH-ABC12-DEF34-GHI56\n` +
            `ZENITH-JKL78-MNO90-PQR12\n` +
            `ZENITH-STU34-VWX56-YZA78\n\n` +
            `❌ Отправьте /cancel для отмены`
        );
        return;
    }
    
    // Если есть текст - обрабатываем как раньше
    let keys;
    
    // Если есть переводы строк - разделяем по строкам
    if (keysText.includes('\n')) {
        keys = keysText.split('\n')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    } else {
        // Если нет переводов строк - разделяем по пробелам
        keys = keysText.split(' ')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    }
    
    if (keys.length === 0) {
        bot.sendMessage(chatId, '❌ Не найдены ключи для добавления!');
        return;
    }
    
    processKeys(keys, chatId);
});

// Функция обработки ключей
function processKeys(keys, chatId) {
    let addedCount = 0;
    let duplicateCount = 0;
    let processed = 0;
    
    bot.sendMessage(chatId, `🚀 Начинаю добавление ${keys.length} ключей...`);
    
    keys.forEach((gameKey) => {
        db.run("INSERT INTO keys (game_key) VALUES (?)", [gameKey], function(err) {
            processed++;
            
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    duplicateCount++;
                    console.log(`❌ Duplicate: ${gameKey}`);
                } else {
                    console.log(`❌ Error adding ${gameKey}: ${err.message}`);
                }
            } else {
                addedCount++;
                console.log(`✅ Added: ${gameKey}`);
            }
            
            // Если это последний ключ, отправляем результат
            if (processed === keys.length) {
                bot.sendMessage(chatId, 
                    `📊 Результат добавления ключей:\n\n` +
                    `✅ Добавлено: ${addedCount}\n` +
                    `❌ Дубликатов: ${duplicateCount}\n` +
                    `📝 Всего обработано: ${keys.length}\n\n` +
                    `🎯 Ключи успешно загружены в базу данных!`
                );
                
                // Показываем общую статистику ключей
                db.get("SELECT COUNT(*) as total FROM keys WHERE is_used = 0", (err, row) => {
                    if (!err && row) {
                        bot.sendMessage(chatId, `📦 Доступных ключей в базе: ${row.total}`);
                    }
                });
            }
        });
    });
}

// Функция отправки баг репорта
function sendBugReport(userId, state, mediaMsg) {
    bugReportState.delete(userId);
    
    // Получаем информацию о пользователе
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, user) => {
        if (err) {
            console.log('Ошибка получения данных пользователя:', err);
        }
        
        const userInfo = user ? 
            `👤 ${user.first_name || 'Неизвестно'} ${user.last_name || ''} (@${user.username || 'нет'})` : 
            `👤 ID: ${userId}`;
        
        const reportText = 
            `🐛 НОВЫЙ БАГ РЕПОРТ\n\n` +
            `${userInfo}\n` +
            `🆔 ID: ${userId}\n` +
            `📂 Тип: ${state.type === 'loader' ? '🔄 Лоадер' : '🎮 Чит'}\n\n` +
            `📝 Описание проблемы:\n${state.description || 'Не указано'}\n\n` +
            `🕐 Время: ${new Date().toLocaleString('ru-RU', {timeZone: 'Europe/Moscow'})}`;
        
        // Отправляем в чат поддержки с кнопкой "Ответить"
        const replyKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💬 Ответить пользователю', callback_data: `reply_${userId}` }]
                ]
            }
        };
        
        
        bot.sendMessage(SUPPORT_CHAT_ID, reportText, replyKeyboard).then(sentMsg => {
            // Если есть медиа - отправляем его
            if (mediaMsg) {
                if (mediaMsg.video) {
                    bot.sendVideo(SUPPORT_CHAT_ID, mediaMsg.video.file_id, {
                        caption: `📹 Видео к баг репорту #${sentMsg.message_id}`,
                        reply_to_message_id: sentMsg.message_id,
                        contentType: 'video/mp4'
                    }).catch(err => console.log('Ошибка отправки видео:', err.message));
                } else if (mediaMsg.photo) {
                    bot.sendPhoto(SUPPORT_CHAT_ID, mediaMsg.photo[mediaMsg.photo.length - 1].file_id, {
                        caption: `📸 Скриншот к баг репорту #${sentMsg.message_id}`,
                        reply_to_message_id: sentMsg.message_id,
                        contentType: 'image/jpeg'
                    }).catch(err => console.log('Ошибка отправки фото:', err.message));
                } else if (mediaMsg.document) {
                    bot.sendDocument(SUPPORT_CHAT_ID, mediaMsg.document.file_id, {
                        caption: `📎 Файл к баг репорту #${sentMsg.message_id}`,
                        reply_to_message_id: sentMsg.message_id,
                        contentType: 'application/octet-stream'
                    }).catch(err => console.log('Ошибка отправки документа:', err.message));
                }
            }
            
            // Уведомляем пользователя об успешной отправке
            bot.sendMessage(userId, 
                `✅ Ваш баг репорт отправлен!\n\n` +
                `📋 Тип: ${state.type === 'loader' ? '🔄 Лоадер' : '🎮 Чит'}\n` +
                `📝 Описание: ${state.description.substring(0, 50)}${state.description.length > 50 ? '...' : ''}\n\n` +
                `💬 Наши разработчики рассмотрят вашу проблему и могут связаться с вами для уточнений.\n\n` +
                `🙏 Спасибо за помощь в улучшении продукта!`
            ).catch(err => {
                console.log(`Ошибка уведомления пользователя ${userId}:`, err.message);
            });
            
        }).catch(err => {
            console.error('Ошибка отправки баг репорта в чат поддержки:', err.message);
            // Уведомляем пользователя об ошибке
            bot.sendMessage(userId, 
                `❌ Произошла ошибка при отправке баг репорта.\n` +
                `Попробуйте позже или обратитесь к администратору.`
            ).catch(err2 => {
                console.log(`Ошибка уведомления пользователя ${userId} об ошибке:`, err2.message);
            });
            return;
        });
    });
}

// Команда добавления партнерских ключей
bot.onText(/\/addpartnerkeys(.*)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ У вас нет прав администратора!');
        return;
    }
    
    const keysText = match[1] ? match[1].trim() : '';
    
    if (!keysText) {
        bot.sendMessage(chatId, 
            `📁 Добавление партнерских ключей\n\n` +
            `💡 Используйте: /addpartnerkeys КЛЮЧ1 КЛЮЧ2 КЛЮЧ3\n` +
            `📝 Партнерские ключи выдаются медиа-партнерам отдельно от обычных ключей.`
        );
        return;
    }
    
    let keys;
    if (keysText.includes('\n')) {
        keys = keysText.split('\n')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    } else {
        keys = keysText.split(' ')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    }
    
    if (keys.length === 0) {
        bot.sendMessage(chatId, '❌ Не найдены ключи для добавления!');
        return;
    }
    
    let addedCount = 0;
    let duplicateCount = 0;
    let processed = 0;
    
    bot.sendMessage(chatId, `🚀 Начинаю добавление ${keys.length} партнерских ключей...`);
    
    keys.forEach((gameKey) => {
        db.run("INSERT INTO partner_keys (game_key) VALUES (?)", [gameKey], function(err) {
            processed++;
            
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    duplicateCount++;
                } else {
                    console.log(`❌ Error adding partner key ${gameKey}: ${err.message}`);
                }
            } else {
                addedCount++;
                console.log(`✅ Added partner key: ${gameKey}`);
            }
            
            if (processed === keys.length) {
                bot.sendMessage(chatId, 
                    `📊 Результат добавления партнерских ключей:\n\n` +
                    `✅ Добавлено: ${addedCount}\n` +
                    `❌ Дубликатов: ${duplicateCount}\n` +
                    `📝 Всего обработано: ${keys.length}\n\n` +
                    `🎯 Партнерские ключи успешно загружены!`
                );
                
                db.get("SELECT COUNT(*) as total FROM partner_keys WHERE is_used = 0", (err, row) => {
                    if (!err && row) {
                        bot.sendMessage(chatId, `🎮 Доступных партнерских ключей: ${row.total}`);
                    }
                });
            }
        });
    });
});

// Команда быстрой рассылки
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ У вас нет прав администратора!');
        return;
    }
    
    const message = match[1];
    
    bot.sendMessage(chatId, '🚀 Начинаю рассылку...');
    
    sendBroadcast(message, null, userId, (err, result) => {
        if (err) {
            bot.sendMessage(chatId, `❌ Ошибка рассылки: ${err.message}`);
            return;
        }
        
        bot.sendMessage(chatId, 
            `📊 Рассылка завершена!\n\n` +
            `✅ Отправлено: ${result.sent}\n` +
            `❌ Ошибок: ${result.errors}\n` +
            `📝 Всего пользователей: ${result.total}`
        );
    });
});

// Команда для проверки ADMIN_ID (для отладки)
bot.onText(/\/whoami/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    bot.sendMessage(chatId, 
        `🆔 Информация:\n\n` +
        `👤 Ваш ID: \`${userId}\`\n` +
        `👑 Админ ID: \`${ADMIN_ID}\`\n` +
        `✅ Статус: ${userId === ADMIN_ID ? 'АДМИН' : 'Пользователь'}\n\n` +
        `🤖 Версия бота: v8.3-Clean-Production`,
        { parse_mode: 'Markdown' }
    );
});

// Команда перезапуска бота на VDS
bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== ADMIN_ID) {
        bot.sendMessage(chatId, '❌ У вас нет прав администратора!');
        return;
    }
    
    try {
        const restartMsg = await bot.sendMessage(chatId, '🔄 Подключаемся к VDS для перезапуска бота...');
        
        // Импортируем функцию перезапуска
        const { restartBot } = require('./vds_restart.js');
        
        const result = await restartBot();
        
        await bot.editMessageText(
            `✅ ${result}\n\n⏰ Бот будет перезапущен через несколько секунд`,
            {
                chat_id: chatId,
                message_id: restartMsg.message_id
            }
        );
        
    } catch (error) {
        console.error('❌ Ошибка перезапуска:', error);
        bot.sendMessage(chatId, `❌ Ошибка перезапуска: ${error.message || error}`);
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('🔴 Polling error:', error.message);
    
    // Специальная обработка конфликта с другими экземплярами
    if (error.message.includes('409') && error.message.includes('Conflict')) {
        console.error('🚨 КОНФЛИКТ: Обнаружен другой экземпляр бота!');
        console.error('⚠️  Остановка polling. Другой экземпляр уже работает.');
        console.error('💡 Для перезапуска выполните: pm2 restart zenith-bot');
        
        // Останавливаем polling без завершения процесса
        try {
            bot.stopPolling();
            console.log('⏹️ Polling остановлен из-за конфликта');
        } catch (e) {
            console.error('Ошибка остановки polling:', e);
        }
        return;
    }
    
    // Если это ошибка сети, пробуем переподключиться
    if (error.message.includes('ENOTFOUND') || 
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT')) {
        console.log('🔄 Пытаемся переподключиться...');
        setTimeout(() => {
            console.log('🟢 Переподключение...');
        }, 5000);
    }
});

// Обработка неперехваченных ошибок Promise
process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message) {
        if (reason.message.includes('user is deactivated') || 
            reason.message.includes('bot was blocked') ||
            reason.message.includes('user not found')) {
            // Игнорируем ошибки недоступных пользователей
            return;
        }
        console.error('🔴 Unhandled Rejection:', reason.message);
    } else {
        console.error('🔴 Unhandled Rejection:', reason);
    }
});

process.on('SIGINT', () => {
    console.log('Завершение работы бота...');
    db.close();
    process.exit(0);
});

// Команда для ответа пользователю из чата поддержки
bot.onText(/\/reply (\d+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Проверяем, что команда отправлена из чата поддержки
    if (chatId !== SUPPORT_CHAT_ID) {
        return;
    }
    
    const targetUserId = parseInt(match[1]);
    const replyText = match[2];
    
    // Отправляем ответ пользователю
    bot.sendMessage(targetUserId, 
        `💬 Ответ от службы поддержки:\n\n` +
        `${replyText}\n\n` +
        `📞 Если у вас есть дополнительные вопросы, создайте новый баг репорт через /start`,
        { parse_mode: 'Markdown' }
    ).then(() => {
        // Подтверждение в чате поддержки
        bot.sendMessage(chatId, 
            `✅ Ответ отправлен пользователю ${targetUserId}`,
            { reply_to_message_id: msg.message_id }
        );
    }).catch(err => {
        // Ошибка отправки
        bot.sendMessage(chatId, 
            `❌ Не удалось отправить ответ пользователю ${targetUserId}\n` +
            `Возможно, пользователь заблокировал бота`,
            { reply_to_message_id: msg.message_id }
        );
    });
});

console.log('🤖 Telegram бот запущен!');
console.log('📢 Канал для подписки:', CHANNEL_URL);
console.log('👑 ID администратора:', ADMIN_ID);
console.log('🐛 Чат поддержки:', SUPPORT_CHAT_ID);
console.log('📺 Медиа партнерский чат:', MEDIA_PARTNER_CHAT_ID);
console.log('✅ Версия: FIXED_2025-08-03_v8.3 - Clean Production');
console.log('� IPv4 конфигурация: Включена');
console.log('⚡ Защита от спама: Активна');
console.log('🛡️ Улучшенная обработка ошибок: Включена');
console.log('🚨 Защита от конфликтов: Включена');
