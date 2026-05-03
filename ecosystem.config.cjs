/**
 * PM2：在仓库根目录启动 API（读根目录 .env 中的 PORT=3003 等）
 * 首次：pm2 start ecosystem.config.cjs --env production && pm2 save && pm2 startup
 * 发版：pm2 restart volleyball-api
 */
module.exports = {
  apps: [
    {
      name: "volleyball-api",
      cwd: __dirname,
      script: "apps/api/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "5s",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
