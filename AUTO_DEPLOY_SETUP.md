# 🚀 АВТОМАТИЧЕСКИЙ ДЕПЛОЙ - НАСТРОЙКА

## 🎯 Цель: Вообще не писать команды на сервере!

После настройки достаточно будет просто делать `git push` и бот автоматически обновится.

## 📋 Настройка (делается ОДИН РАЗ):

### 1️⃣ На сервере запустите webhook сервер:

```bash
cd /opt/zenith-bot
git pull origin main
npm install express
pm2 start ecosystem.config.js
pm2 save
```

Это запустит:
- `zenith-bot` (основной бот)
- `webhook-server` (сервер автообновлений)

### 2️⃣ В GitHub добавьте webhook:

1. Откройте https://github.com/maskkkkkkiro/tg_bot/settings/hooks
2. Нажмите "Add webhook"
3. Заполните:
   - **Payload URL**: `http://ваш-сервер-ip:3001/webhook`
   - **Content type**: `application/json`
   - **Secret**: `zenith_bot_webhook_secret_2025`
   - **Events**: Just the push event

### 3️⃣ Альтернативно - GitHub Actions (рекомендуется):

1. Откройте https://github.com/maskkkkkkiro/tg_bot/settings/secrets/actions
2. Добавьте секреты:
   - `VDS_HOST`: IP адрес вашего сервера
   - `VDS_USERNAME`: root
   - `VDS_SSH_KEY`: ваш приватный SSH ключ
   - `VDS_PORT`: 22 (или ваш SSH порт)

## 🎉 ГОТОВО! Теперь автоматический деплой:

### Способ 1: Git Push (всегда работает)
```bash
git add .
git commit -m "Новая функция"
git push origin main
```
→ Бот автоматически обновится на сервере!

### Способ 2: Веб-панель
Откройте `deploy_panel.html` в браузере и нажмите кнопку "Обновить Бота"

### Способ 3: HTTP запрос
```bash
curl -X POST http://ваш-сервер:3001/manual-update
```

## 📊 Проверка работы:

1. **Статус серверов**: `pm2 status`
2. **Логи webhook**: `pm2 logs webhook-server`
3. **Логи бота**: `pm2 logs zenith-bot`
4. **Health check**: `curl http://ваш-сервер:3001/health`

## 🔧 Что происходит автоматически:

1. **Git push** → GitHub получает изменения
2. **GitHub** → отправляет webhook на ваш сервер
3. **Webhook сервер** → автоматически:
   - Скачивает новый код (`git pull`)
   - Устанавливает зависимости (`npm install`)
   - Перезапускает бота (`pm2 restart`)
   - Проверяет статус

## ❗ Важно:

- Webhook сервер должен быть запущен: `pm2 status webhook-server`
- Порт 3001 должен быть открыт в firewall
- GitHub должен иметь доступ к вашему серверу

## 🆘 Если что-то не работает:

1. Проверьте логи: `pm2 logs webhook-server`
2. Проверьте доступность: `curl http://localhost:3001/health`
3. Проверьте GitHub webhook в настройках репозитория

Теперь вам НИКОГДА не нужно заходить на сервер! 🎉
