module.exports = {
  apps: [
    {
      name: 'wabot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      min_uptime: '10s',
      max_restarts: 1000,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
