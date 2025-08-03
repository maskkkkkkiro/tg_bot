# 🎮 Zenith DLC Bot

Telegram bot for distributing Zenith DLC keys with media partnership system and abuse protection.

## ✨ Main Features

- 🎯 **Key Distribution** - one key per user with subscription verification
- 🔐 **Captcha Protection** - protection against bots and automation
- 📺 **Media Partnership** - system for content creators with payments
- 🐛 **Bug Reports** - feedback system with support
- 📢 **Broadcasts** - notifications for all users
- 👑 **Admin Panel** - key and application management

## 🚀 Quick Start

1. **Clone repository**
```bash
git clone https://github.com/maskkkkkkiro/tg_bot.git
cd tg_bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure settings** in `index.js`:
   - `BOT_TOKEN` - Telegram bot token
   - `ADMIN_ID` - administrator ID
   - `CHANNEL_USERNAME` - channel for subscription check
   - `SUPPORT_CHAT_ID` - support chat
   - `MEDIA_PARTNER_CHAT_ID` - media applications chat

4. **Start the bot**
```bash
# Regular start
node index.js

# With PM2 (recommended)
pm2 start ecosystem.config.js

# Or simple script
./start.sh
```

⚠️ **IMPORTANT**: For Telegram bots use `fork` mode, NOT `cluster`!

## 📋 Dependencies

- `node-telegram-bot-api` - Telegram Bot API
- `sqlite3` - Database
- `canvas` - Captcha generation
- `https` - File downloads

## 🏗️ Architecture

- **Database**: SQLite with tables for users, keys, applications
- **States**: Map objects for dialog tracking
- **Protection**: Captcha, subscription check, spam protection
- **Media System**: Applications, approval, payments

## 🔧 Administration

### Admin commands:
- `/admin` - control panel
- `/addkey KEY` - add single key
- `/addkeys` - bulk key addition
- `/addpartnerkeys` - add partner keys
- `/broadcast MESSAGE` - quick broadcast
- `/restart` - restart bot on VDS
- `/whoami` - check admin status

### Admin panel functions:
- 📊 User and key statistics
- 🔑 Key management
- 📢 Broadcast creation
- 👥 User overview

## 🎬 Media Partnership

System for collaboration with content creators:

1. **Application submission** through bot
2. **Moderation** by administrator
3. **Key provision** when approved
4. **Payments** for views:
   - 105₽ per 1K views (up to 5K)
   - 75₽ per 1K views (over 5K)

## 🛡️ Security

- ✅ IPv4-first DNS for stability
- ✅ Spam protection for key requests
- ✅ Captcha for new users
- ✅ Channel subscription verification
- ✅ Atomic database operations
- ✅ Comprehensive Telegram error handling

## 🚀 Auto-Deployment System

- ✅ GitHub Actions for automatic deployment
- ✅ Webhook server for instant updates
- ✅ VDS restart functionality via `/restart` command
- ✅ Manual restart via `restart_bot.bat`

## 📊 Statistics

- 🔄 **Restarts**: Optimized stability
- 🐛 **Errors**: Polling and user deactivation handled
- 📈 **Performance**: Database operations optimized
- 🔒 **Security**: Enhanced error handling

## 🆕 Version v8.3 - Clean Production

### Updates v8.3:
- 🧹 **PROJECT CLEANED** - removed all unnecessary files
- 📁 Only essential components remain
- 🚀 Automatic deployment via GitHub Actions
- 🌐 Webhook server for instant updates
- 📊 Improved .gitignore for cleanliness
- 🔄 VDS restart system with SSH automation

### Project structure:
```
├── index.js              # Main bot code
├── webhook_server.js     # Auto-deploy server
├── vds_restart.js        # VDS restart service
├── ecosystem.config.js   # PM2 configuration
├── package.json          # Dependencies
├── start.sh             # Startup script
├── restart_bot.bat      # Windows restart script
├── README.md            # Documentation
├── DEPLOY.md            # Deployment guide
├── AUTO_DEPLOY_SETUP.md # Auto-deploy setup
├── FIX_CONFLICT.md      # Conflict resolution
└── .github/workflows/   # GitHub Actions
```

### Previous fixes v8.1:
- 🚨 **FIXED infinite restart loop** on 409 conflicts
- ❌ Removed `process.exit(1)` on conflict detection
- ✅ Now bot simply stops polling without process termination
- 🔧 Configured PM2 parameters to prevent excessive restarts
- 📋 Added detailed conflict resolution instructions

### Previous fixes v8:
- Added protection against multiple bot instances
- Improved polling configuration with timeouts
- Added emergency conflict resolution instructions
- Optimized connection stability to Telegram API

### Technical information:
- Node.js compatibility: 14+
- Database: SQLite 3
- Telegram Bot API: Latest version
- Race condition protection

## 📖 Documentation

- [🚀 Automatic Deployment](AUTO_DEPLOY_SETUP.md) - **NO SERVER COMMANDS NEEDED!**
- [Deployment Instructions](DEPLOY.md)
- [Emergency Conflict Fix](FIX_CONFLICT.md)
- [VDS Restart Guide](VDS_RESTART_GUIDE.md)
- Technical documentation in code comments

## 🤝 Support

If you encounter problems:
1. Check logs: `pm2 logs zenith-bot`
2. Restart bot: `pm2 restart zenith-bot`
3. Use `/restart` command in bot
4. Create issue in repository

## 📄 License

This project is created for Zenith DLC key distribution.

---
**Version**: v8.3-Clean-Production  
**Status**: ✅ Stable + Auto-Deploy + VDS Restart
**Admin ID**: 7550254535
