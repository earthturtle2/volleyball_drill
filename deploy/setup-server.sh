#!/usr/bin/env bash
# ============================================================
# 腾讯轻量级服务器一键初始化
# 用法：scp deploy/setup-server.sh root@YOUR_SERVER:/tmp/
#       ssh root@YOUR_SERVER 'bash /tmp/setup-server.sh'
# ============================================================
set -euo pipefail

APP_DIR="/data/node-apps/volleyball_drill"
GIT_DIR="/data/git/volleyball_drill.git"
DOMAIN="volleyball.itorange.online"

echo "=== 1/7 安装 Node.js 20 ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v)  npm $(npm -v)"

echo "=== 2/7 安装 PM2 ==="
npm list -g pm2 &>/dev/null 2>&1 || npm i -g pm2

echo "=== 3/7 创建目录 ==="
mkdir -p "$APP_DIR/data" "$GIT_DIR"

echo "=== 4/7 初始化 bare git 仓库 ==="
if [ ! -f "$GIT_DIR/HEAD" ]; then
  git init --bare "$GIT_DIR"
fi

echo "=== 5/7 写入 post-receive 钩子 ==="
cat > "$GIT_DIR/hooks/post-receive" << 'HOOK'
#!/bin/bash
set -euo pipefail
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
APP="/data/node-apps/volleyball_drill"
echo ">>> checkout"
git --work-tree="$APP" --git-dir="$(cd "$(dirname "$0")/.."; pwd)" checkout -f main
cd "$APP"
echo ">>> build & restart"
bash scripts/server-release.sh
echo ">>> deploy done"
HOOK
chmod +x "$GIT_DIR/hooks/post-receive"

echo "=== 6/7 配置 Nginx ==="
if ! command -v nginx &>/dev/null; then
  apt-get install -y nginx
fi
cat > "/etc/nginx/conf.d/${DOMAIN}.conf" << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:3003;
    }

    location / {
        try_files \$uri /index.html;
    }
}
NGINX
nginx -t && systemctl reload nginx

echo "=== 7/7 生成 .env ==="
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << ENV
DATABASE_URL=file:./data/volleyball.db
JWT_ACCESS_SECRET=$(openssl rand -base64 32)
PUBLIC_APP_URL=https://$DOMAIN
PORT=3003
HOST=127.0.0.1
ENV
  echo "已生成 $APP_DIR/.env，请按需修改"
else
  echo "$APP_DIR/.env 已存在，跳过"
fi

echo ""
echo "========================================="
echo "  初始化完成！"
echo "========================================="
echo ""
echo "在本地添加部署 remote："
echo "  git remote add deploy ssh://root@<服务器IP>${GIT_DIR}"
echo ""
echo "推送部署："
echo "  git push deploy main"
echo ""
echo "HTTPS 证书（可选）："
echo "  apt install certbot python3-certbot-nginx"
echo "  certbot --nginx -d $DOMAIN"
echo ""
