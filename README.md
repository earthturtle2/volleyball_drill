# 排球战术训练（Web）

基于当前战术项目复制改造的排球版本：战术编辑、JSON 校验、排球场动效预览、模板库、比赛准备与分享只读页。生产部署目标：**volleyball.itorange.online**（Nginx 静态 + `/api` 反代 Node）。

## 产品目标

把项目打造成“简单、易用、专业”的排球教学工具：

- **简单**：教练从内置模板开始，减少从空白画板搭建战术的成本。
- **易用**：拖动球员、球路和关键步骤，自动生成可逐步播放的教学动画。
- **专业**：支持 6v6 排球场、3m 进攻线、接发/快攻/后排进攻/拦防等专项模板。
- **可教学**：一键分享只读链接，队员无需登录即可在手机上复盘。
- **可比赛**：用“比赛准备”把战术按编号、分类和口令整理成临场调用卡。

## 教练快速开始

1. 登录后进入“我的战术”。
2. 在“专业模板一键开练”中选择接发、快攻、Pipe 或拦防防反模板。
3. 系统会直接复制为个人战术并进入编辑器，可立即改成本队站位。
4. 进入“教学模式”投屏播放，只保留逐步播放和学员分享等课堂常用功能。
5. 保存后生成只读分享链接，或加入“比赛准备”作为临场调用卡。

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
