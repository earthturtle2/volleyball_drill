# 部署到腾讯轻量级服务器

## 架构

```
本地 git push deploy main
        │
        ▼
服务器 bare repo (/data/git/volleyball_drill.git)
        │  post-receive hook
        ▼
工作目录 (/data/node-apps/volleyball_drill)
  npm ci → build → db:push → pm2 restart
        │
        ▼
Nginx (80/443) ──┬── /api/*  → 127.0.0.1:3003 (Fastify)
                 └── /*      → apps/web/dist (SPA)
```

## 一、首次初始化（一键脚本）

```bash
# 1. 上传脚本到服务器
scp deploy/setup-server.sh root@YOUR_SERVER:/tmp/

# 2. SSH 到服务器执行
ssh root@YOUR_SERVER 'bash /tmp/setup-server.sh'
```

脚本自动完成：安装 Node 20 + PM2 + Nginx → 创建 bare git 仓库 → 配置 post-receive 钩子 → 写入 Nginx 配置到 `/etc/nginx/conf.d/` → 生成 `.env`。

## 二、本地配置 git remote

```bash
# 在项目根目录
git remote add deploy ssh://root@YOUR_SERVER_IP/data/git/volleyball_drill.git
```

## 三、日常部署

```bash
git push deploy main
```

推送后服务器自动执行：`npm ci` → `npm run build` → `db:push` → `pm2 restart`。

## 四、HTTPS（推荐）

```bash
ssh root@YOUR_SERVER
apt install -y certbot python3-certbot-nginx
certbot --nginx -d volleyball.itorange.online
```

证书自动续期已由 certbot 配置。

## 五、常用运维命令

```bash
# 查看 API 日志
pm2 logs volleyball-api

# 查看状态
pm2 status

# 手动重启
pm2 restart volleyball-api

# 手动构建（不通过 git push）
cd /data/node-apps/volleyball_drill
git pull origin main
bash scripts/server-release.sh
```

## 六、环境变量

服务器上 `/data/node-apps/volleyball_drill/.env`：

```ini
DATABASE_URL=file:./data/volleyball.db
JWT_ACCESS_SECRET=<自动生成的随机字符串>
PUBLIC_APP_URL=https://volleyball.itorange.online
PORT=3003
HOST=127.0.0.1
```

> `.env` 在 `.gitignore` 中，`git push` 不会覆盖它。

## 七、目录说明

| 路径 | 用途 |
|------|------|
| `/data/git/volleyball_drill.git` | bare git 仓库（接收 push） |
| `/data/node-apps/volleyball_drill` | 工作目录（代码 + 构建产物） |
| `/data/node-apps/volleyball_drill/data/volleyball.db` | SQLite 数据库 |
| `/data/node-apps/volleyball_drill/.env` | 环境变量（不进 git） |

## 八、故障排查

| 现象 | 排查 |
|------|------|
| push 后 502 | `pm2 logs volleyball-api`，检查 `.env` 是否存在 |
| 页面白屏 | 确认 Nginx root 指向 `apps/web/dist`，检查 `try_files` |
| 数据库锁 | `pm2 restart volleyball-api`（WAL 模式下极少出现） |
| 前端路由 404 | Nginx `location /` 需 `try_files $uri /index.html` |
| npm ci 报错 Rollup | 根 `package.json` 已有 `optionalDependencies` 处理 |
