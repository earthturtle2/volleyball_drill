# 排球战术训练（Web）

基于当前战术项目复制改造的排球版本：战术编辑、JSON 校验、排球场动效预览、模板库、比赛准备与分享只读页。生产部署目标：**volleyball.itorange.online**（Nginx 静态 + `/api` 反代 Node）。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | Vite 6、React 19、TypeScript、react-router-dom 7 |
| 后端 | Fastify 5、Drizzle ORM、SQLite（`better-sqlite3`） |
| 共享 | `packages/shared`：Zod 校验战术 JSON v1 |
| 鉴权 | JWT 短期 access + Opaque refresh（SHA-256 存库） |

## 排球改造点

- 域名与部署名改为 `volleyball.itorange.online` / `volleyball-api`。
- 默认端口改为 `3003`，默认数据库为 `file:./data/volleyball.db`。
- 前端主题改为蓝色排球场馆风格。
- 战术画布改为 18m x 9m 排球全场/9m x 9m 单侧场，包含球网和 3m 进攻线。
- 每方球员上限改为 6 人，默认球队名单为 1-6 号。
- 内置模板替换为接发、快攻、后排进攻、拦防防反等排球模板。

## 本地开发

建议使用 Node.js 20（项目已包含 `.nvmrc`）。

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

- 前端默认 <http://localhost:5173>
- API 默认 <http://127.0.0.1:3003>
- 生产分享前缀使用 `PUBLIC_APP_URL=https://volleyball.itorange.online`

## 构建

```bash
npm run build
```

## 部署要点

- 服务器目录建议：`/data/node-apps/volleyball_drill`
- PM2 应用名：`volleyball-api`
- Nginx 示例：`deploy/nginx-volleyball.itorange.online.conf.example`
- systemd 示例：`deploy/volleyball-api.service.example`
