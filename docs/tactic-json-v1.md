# 战术 JSON v1 字段说明

与 `examples/tactic-play.v1.json` 一致；坐标 **`rules.coordinateSystem: "normalized"`** 时为排球场矩形内 **0-1** 归一化坐标。排球版默认全场为 18m x 9m，单侧场为 9m x 9m。

## 顶层字段

| 字段 | 说明 |
|------|------|
| `schemaVersion` | 当前固定为 `1`。 |
| `meta` | 名称、说明、战术类别 `category`、标签、场地预设、总时长 `durationMs`。 |
| `teams` | 当前仍复用 `offense` / `defense` 两个键，UI 展示为“本方 / 对方”。 |
| `actors` | `player` 含 `team`、`number`，可选 `rosterPlayerId` 关联球队名单；`ball` 可 `heldBy` 某一 `player` id。排球版每方最多 6 人。 |
| `keyframes` | 每个时间点的球员坐标与可选朝向。 |
| `events` | 如 `pass`：用于表示发球、一传、二传、进攻传导等教学点；`screen` 在排球版 UI 中作为拦网标记；`finish_options` 用于标注扣球/吊球落点和保护点。 |
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
    { "kind": "pass", "label": "保护", "to": "o6", "priority": "safety" }
  ]
}
```

- `shot` 在排球版表示扣球、吊球或发球落点。
- `pass` 在排球版可表示保护、调整或再次组织的选择。
- `priority` 目前用于主选/变线/保护的视觉强调。
