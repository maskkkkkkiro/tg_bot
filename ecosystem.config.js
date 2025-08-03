module.exports = {
  apps: [
    {
      name: 'zenith-bot',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
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
      max_restarts: 3,
      min_uptime: '30s',
      restart_delay: 10000
    },
    {
      name: 'webhook-server',
      script: 'webhook_server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_SECRET: 'zenith_bot_webhook_secret_2025'
      },
      error_file: './logs/webhook_err.log',
      out_file: './logs/webhook_out.log',
      log_file: './logs/webhook_combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 5000
    }
  ]
};
