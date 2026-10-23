// pm2 process file: `pm2 start ecosystem.config.cjs` (run `npm run build` first).
module.exports = {
  apps: [
    {
      name: 'appr_jiexpo',
      script: 'dist/main.js',
      // .env and ./storage are resolved from the working directory
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10000, // let in-flight requests and the SQL/SMTP pools close
      time: true, // timestamp pm2 log lines
      out_file: 'storage/logs/pm2-out.log',
      error_file: 'storage/logs/pm2-error.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
