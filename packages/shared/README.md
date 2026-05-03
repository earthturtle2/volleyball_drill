# @volleyball/shared

- **职责**：`TacticDocumentV1`（Zod）与 `parseTacticDocumentV1` / `tryParseTacticDocumentV1`。
- **构建**：`npm run build` 产出 `dist/`，供 Node 与类型检查消费；Vite 开发态可直接从 `src` 做 alias 解析（见 [apps/web/vite.config.ts](../../apps/web/vite.config.ts)）。
