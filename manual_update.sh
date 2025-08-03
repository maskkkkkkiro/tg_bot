#!/bin/bash

# Скрипт для ручного обновления бота на VDS
# Используется когда автодеплой не работает

echo "🚀 Ручное обновление Zenith Bot на VDS..."

# Подключаемся к VDS и выполняем команды
sshpass -p 'o*-?k*4UNaAU8p' ssh -o StrictHostKeyChecking=no root@92.51.22.201 << 'EOF'
    echo "📍 Подключен к VDS"
    
    # Переходим в папку проекта
    cd /opt/zenith-bot || { echo "❌ Папка /opt/zenith-bot не найдена!"; exit 1; }
    
    echo "📥 Получаем последние изменения..."
    git fetch origin
    git reset --hard origin/main
    git pull origin main
    
    echo "📦 Устанавливаем зависимости..."
    npm install --production
    
    echo "🔄 Перезапускаем бота..."
    pm2 restart zenith-bot || pm2 start ecosystem.config.js
    
    echo "📊 Статус PM2:"
    pm2 status
    
    echo "📋 Последние логи:"
    pm2 logs zenith-bot --lines 5 || echo "Логи недоступны"
    
    echo "✅ Обновление завершено!"
EOF

echo "🎉 Ручное обновление выполнено!"
