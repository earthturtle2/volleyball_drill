# @volleyball/web

- **开发**：Vite 将 `/api` 代理到 `http://127.0.0.1:3003`（见 [vite.config.ts](./vite.config.ts)）。
- **生产构建**：`npm run build` 输出到 `dist/`，由 Nginx 对 `volleyball.itorange.online` 提供静态文件；接口仍走同域 `/api/...`。
- **战术 JSON 类型**：`@volleyball/shared` 在 Vite 中解析到 [packages/shared/src](../../packages/shared/src) 源码，便于与后端契约一致。
