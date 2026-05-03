#!/usr/bin/env bash
# 构建 + 重启，由 post-receive hook 或手动执行
# 用法：bash scripts/server-release.sh
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required, current version is $(node -v)" >&2
  exit 1
fi

echo "[1/4] npm ci (skip if lockfile unchanged)"
LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
CACHED_HASH=""
[ -f node_modules/.lockfile-hash ] && CACHED_HASH=$(cat node_modules/.lockfile-hash)
if [ "$LOCK_HASH" = "$CACHED_HASH" ]; then
  echo "  lockfile unchanged — skipping npm ci"
else
  NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false npm ci --no-audit --no-fund
  echo "$LOCK_HASH" > node_modules/.lockfile-hash
fi

echo "[2/4] build"
NODE_ENV=production npm run build

echo "[3/5] migrate (manual SQL for SQLite compatibility)"
node scripts/migrate-add-teams.cjs

echo "[4/5] db:push"
npm run db:push -w @volleyball/api

echo "[5/5] pm2 restart"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe volleyball-api >/dev/null 2>&1; then
    pm2 restart volleyball-api --update-env
  else
    pm2 start ecosystem.config.cjs --env production
    pm2 save 2>/dev/null || true
  fi
else
  echo "pm2 未安装，请先: npm i -g pm2"
  exit 1
fi

echo "Done ✓"
