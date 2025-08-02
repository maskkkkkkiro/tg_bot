module.exports = {
  apps: [{
    name: 'zenith-bot',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork', // ВАЖНО: НЕ cluster для Telegram ботов!
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 3,  // Уменьшено для предотвращения бесконечных перезапусков при конфликтах
    min_uptime: '30s', // Увеличено время работы перед перезапуском
    restart_delay: 10000 // Увеличена задержка между перезапусками
  }]
};
