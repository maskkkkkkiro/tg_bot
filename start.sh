#!/bin/bash

# Скрипт для правильного запуска Zenith DLC Bot
# Использование: ./start.sh

echo "🚀 Запуск Zenith DLC Bot..."

# Остановить все экземпляры
echo "🛑 Остановка существующих экземпляров..."
pm2 stop zenith-bot 2>/dev/null || true
pm2 delete zenith-bot 2>/dev/null || true

# Подождать немного
sleep 2

# Запустить в правильном режиме
echo "▶️  Запуск бота в fork режиме..."
pm2 start ecosystem.config.js

# Сохранить конфигурацию
echo "💾 Сохранение конфигурации..."
pm2 save

# Показать статус
echo "📊 Статус бота:"
pm2 status

echo ""
echo "✅ Бот успешно запущен!"
echo "📋 Проверить логи: pm2 logs zenith-bot"
echo "🔄 Перезапустить: pm2 restart zenith-bot"
echo "🛑 Остановить: pm2 stop zenith-bot"
