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
    max_restarts: 5,
    min_uptime: '10s',
    restart_delay: 5000
  }]
};
