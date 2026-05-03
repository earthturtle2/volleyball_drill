# 战术 JSON v1 字段说明

与 `examples/tactic-play.v1.json` 一致；坐标 **`rules.coordinateSystem: "normalized"`** 时为排球场矩形内 **0-1** 归一化坐标。排球版默认全场为 18m x 9m，半场为 9m x 9m。

## 顶层字段

| 字段 | 说明 |
|------|------|
| `schemaVersion` | 当前固定为 `1`。 |
| `meta` | 名称、说明、战术类别 `category`、标签、场地预设、总时长 `durationMs`。 |
| `teams` | 当前仍复用 `offense` / `defense` 两个键，UI 展示为“本队 / 对手”。 |
| `actors` | `player` 含 `team`、`number`，可选 `rosterPlayerId` 关联球队名单；`ball` 可 `heldBy` 某一 `player` id。排球版每方最多 6 人。 |
| `keyframes` | 每个时间点的球员坐标与可选朝向。 |
| `events` | 兼容 legacy `pass` / `screen` / `possess` / `finish_options`；推荐用 `ball_action` 表示发球、一传、二传、进攻、吊球、防起、保护等触球，用 `block` 表示拦网封线路。 |
| `interpolation` | 播放层插值设置。 |
| `rules` | 坐标系统与边界声明。 |

## `finish_options` 事件

用于在战术播放/编辑画面中显示“进攻选择”标注。事件本身不改变球权，只作为教学可视化。

```json
{
  "t": 6500,
  "kind": "finish_options",
  "from": "o4",
  "note": "四号位进攻读拦防。",
  "options": [
    { "kind": "shot", "label": "直线", "x": 0.22, "y": 0.82, "priority": "primary" },
    { "kind": "shot", "label": "大斜线", "x": 0.2, "y": 0.28, "priority": "counter" },
    { "kind": "cover", "label": "保护", "to": "o6", "priority": "safety" }
  ]
}
```

- `shot` / `tip` 表示扣球或吊球落点，落点需在对手半场。
- `pass` / `cover` 表示保护、调整或再次组织的选择，目标需是进攻人同队球员。
- `priority` 目前用于主选/变线/保护的视觉强调。

## legacy 兼容策略

- `pass` 仍合法；可额外带 `action` / `subtype`（如 `serve`、`receive`、`set`、`attack`、`tip`、`dig`、`cover`）让前端渲染不同球路视觉。
- `screen` / `screen_end` 仍合法，排球语境中按拦网标记处理；新数据可用 `block` / `block_end`。
- `possess` / `possess_end` 仍合法，排球语境中仅表示某一时刻的触球状态，不表示移动带球。
- `finish_options.options` 会校验结构：每项 `kind` 为 `shot` / `tip` 或 `pass` / `cover`，并且需要有效 `to` 或完整 `x`/`y` 落点。
