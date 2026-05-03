# API 草图

**Base URL（生产）**：`https://volleyball.itorange.online/api/v1`

排球版沿用原战术系统的 REST 结构：登录、球队、战术、模板库、比赛准备和分享页接口保持不变，数据模型中的 `document` 使用战术 JSON v1。

## 战术示例

```json
{
  "name": "5-1 接发到四号位",
  "description": "五号位一传到位，二传拉开给四号位主攻",
  "category": "接发站位",
  "tags": ["serve_receive", "outside"]
}
```

`viewUrl` 示例：`https://volleyball.itorange.online/view/{token}`
