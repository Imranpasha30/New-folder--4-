// PM2 ecosystem — keeps both Node processes alive across crashes & reboots.
// Usage:
//   pm2 start pm2.config.cjs        # first boot
//   pm2 reload pm2.config.cjs --update-env   # zero-downtime restart with fresh env
//   pm2 save && pm2 startup         # persist across server reboots
module.exports = {
  apps: [
    {
      name: 'portfolio-web',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        // GEMINI_KEY is injected by the deploy script via process env;
        // PM2 passes it through with --update-env on reload.
        GEMINI_KEY: process.env.GEMINI_KEY || '',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/web-error.log',
      out_file: 'logs/web-out.log',
    },
    {
      name: 'portfolio-mp',
      script: 'multiplayer-server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/mp-error.log',
      out_file: 'logs/mp-out.log',
    },
  ],
};
