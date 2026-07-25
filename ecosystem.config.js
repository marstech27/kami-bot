// ecosystem.config.js
// Production process manager config for PM2
// Usage: pm2 start ecosystem.config.js  (starts in cluster mode)
//        pm2 save                       (persist restart on reboot)
//        pm2 monit                      (live dashboard)

module.exports = {
    apps: [
        {
            name: 'kami-bot',
            script: './index.js',
            cwd: __dirname,

            instances: 1,             // ⚠️ Use 1 only! Baileys (WhatsApp) is stateful —
                                      // multi-instance = double messages / broken sessions.
            exec_mode: 'fork',        // must be fork for stateful apps

            watch: false,             // no watch in production
            max_memory_restart: '800M',

            // Auto-restart on crash
            autorestart: true,
            min_uptime: '10s',
            max_restarts: 50,
            restart_delay: 3000,

            // Kill long-running stuck processes
            kill_timeout: 5000,
            listen_timeout: 10000,

            env: {
                NODE_ENV: 'production',
            },

            // Log rotation (prevent huge log files)
            merge_logs: true,
            max_size: '10M',
            retain: 5,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
        },
    ],
};
