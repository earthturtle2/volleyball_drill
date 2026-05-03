import type { TacticDocumentV1 } from "@volleyball/shared";

/**
 * Built-ins model common volleyball phases while keeping the v1 motion schema:
 * pass events represent serve/receive/set/attack flow, and screen markers are
 * reused as block markers to avoid a schema break.
 */
export interface Template {
  id: string;
  nameKey: string;
  descKey: string;
  document: TacticDocumentV1;
}

type PlayerActor = Extract<TacticDocumentV1["actors"][number], { type: "player" }>;
type BallActor = Extract<TacticDocumentV1["actors"][number], { type: "ball" }>;
type Keyframe = TacticDocumentV1["keyframes"][number];
type PoseMap = Keyframe["poses"];

const BASE_TEAMS = {
  offense: { id: "home", label: "本队", color: "#f97316" },
  defense: { id: "away", label: "对手", color: "#38bdf8" },
};

const FULL_COURT = {
  preset: "full",
  orientation: "home_on_right",
  sizeMeters: { length: 18, width: 9 },
};

const COMMON_DOC = {
  interpolation: { position: "linear", facing: "shortestAngle" },
  rules: { coordinateSystem: "normalized" as const, bounds: { x: [0, 1] as [number, number], y: [0, 1] as [number, number] } },
};

const T6 = [0, 1600, 3200, 4800, 6400, 8000] as const;

function player(id: string, team: "offense" | "defense", number: number, label = String(number)): PlayerActor {
  return { id, type: "player", team, number, label };
}

function ball(heldBy?: string): BallActor {
  return heldBy ? { id: "ball", type: "ball", heldBy } : { id: "ball", type: "ball" };
}

function kf(t: number, poses: PoseMap): Keyframe {
  return { t, poses };
}

const HOME_BASE: PoseMap = {
  o1: { x: 0.82, y: 0.2, facingDeg: 180 },
  o2: { x: 0.63, y: 0.34, facingDeg: 180 },
  o3: { x: 0.62, y: 0.5, facingDeg: 180 },
  o4: { x: 0.62, y: 0.74, facingDeg: 180 },
  o5: { x: 0.83, y: 0.72, facingDeg: 180 },
  o6: { x: 0.88, y: 0.5, facingDeg: 180 },
};

const AWAY_BASE: PoseMap = {
  d1: { x: 0.08, y: 0.5, facingDeg: 0 },
  d2: { x: 0.38, y: 0.24, facingDeg: 0 },
  d3: { x: 0.38, y: 0.5, facingDeg: 0 },
  d4: { x: 0.38, y: 0.76, facingDeg: 0 },
  d5: { x: 0.18, y: 0.34, facingDeg: 0 },
  d6: { x: 0.18, y: 0.66, facingDeg: 0 },
};

function poses(...updates: Array<Partial<PoseMap>>): PoseMap {
  return Object.assign({}, HOME_BASE, AWAY_BASE, ...updates) as PoseMap;
}

const ACTORS: TacticDocumentV1["actors"] = [
  player("o1", "offense", 1),
  player("o2", "offense", 2),
  player("o3", "offense", 3),
  player("o4", "offense", 4),
  player("o5", "offense", 5),
  player("o6", "offense", 6),
  player("d1", "defense", 1, "D1"),
  player("d2", "defense", 2, "D2"),
  player("d3", "defense", 3, "D3"),
  player("d4", "defense", 4, "D4"),
  player("d5", "defense", 5, "D5"),
  player("d6", "defense", 6, "D6"),
];

export const TEMPLATES: Template[] = [
  {
    id: "serve-receive-51",
    nameKey: "tpl.serveReceive.name",
    descKey: "tpl.serveReceive.desc",
    document: {
      schemaVersion: 1,
      meta: {
        name: "5-1 接发站位到四号位强攻",
        description: "三人接发，五号位一传到二传点，二传拉开到四号位攻手，观察直线和斜线落点。",
        category: "接发站位",
        tags: ["serve-receive", "5-1", "outside"],
        court: FULL_COURT,
        durationMs: 8000,
      },
      teams: BASE_TEAMS,
      actors: [...ACTORS, ball("d1")],
      keyframes: [
        kf(T6[0], poses()),
        kf(T6[1], poses({ d1: { x: 0.11, y: 0.5, facingDeg: 0 }, o5: { x: 0.8, y: 0.72, facingDeg: 185 } })),
        kf(T6[2], poses({ o5: { x: 0.76, y: 0.68, facingDeg: 170, cpx: 0.82, cpy: 0.72 }, o2: { x: 0.58, y: 0.47, facingDeg: 180 } })),
        kf(T6[3], poses({ o2: { x: 0.55, y: 0.5, facingDeg: 180 }, o4: { x: 0.55, y: 0.78, facingDeg: 200 }, d3: { x: 0.47, y: 0.58, facingDeg: 0 }, d4: { x: 0.47, y: 0.75, facingDeg: 0 } })),
        kf(T6[4], poses({ o4: { x: 0.52, y: 0.8, facingDeg: 210 }, o6: { x: 0.78, y: 0.54, facingDeg: 180 }, d3: { x: 0.49, y: 0.62, facingDeg: 0 }, d4: { x: 0.49, y: 0.78, facingDeg: 0 } })),
        kf(T6[5], poses({ o4: { x: 0.54, y: 0.76, facingDeg: 200 }, o5: { x: 0.8, y: 0.72, facingDeg: 170 }, d5: { x: 0.22, y: 0.28, facingDeg: 15 }, d6: { x: 0.22, y: 0.66, facingDeg: 25 } })),
      ],
      events: [
        { t: 900, kind: "pass", action: "serve", from: "d1", to: "o5", note: "对手跳飘发到五号位通道。" },
        { t: 2800, kind: "pass", action: "receive", from: "o5", to: "o2", note: "五号位一传稳定到二传点。" },
        { t: 4500, kind: "pass", action: "set", from: "o2", to: "o4", note: "二传拉开给四号位攻手。" },
        { t: 5200, kind: "screen", from: "d3", angle: 90, note: "对手中间人并拦。" },
        { t: 5200, kind: "screen", from: "d4", angle: 90, note: "对手四号位形成双人拦网。" },
        { t: 6800, kind: "finish_options", from: "o4", note: "四号位进攻读拦防。", options: [
          { kind: "shot", label: "直线", x: 0.22, y: 0.82, priority: "primary" },
          { kind: "shot", label: "大斜线", x: 0.2, y: 0.28, priority: "counter" },
          { kind: "pass", label: "保护", to: "o6", priority: "safety" },
        ] },
      ],
      ...COMMON_DOC,
    },
  },
  {
    id: "quick-middle",
    nameKey: "tpl.quickMiddle.name",
    descKey: "tpl.quickMiddle.desc",
    document: {
      schemaVersion: 1,
      meta: {
        name: "一传到位：副攻短平快",
        description: "六号位一传到位，二传压低节奏给三号位快球，边攻牵制对手拦网。",
        category: "快攻配合",
        tags: ["quick", "middle", "tempo"],
        court: FULL_COURT,
        durationMs: 8000,
      },
      teams: BASE_TEAMS,
      actors: [...ACTORS, ball("o6")],
      keyframes: [
        kf(T6[0], poses({ o6: { x: 0.86, y: 0.48, facingDeg: 180 } })),
        kf(T6[1], poses({ o6: { x: 0.8, y: 0.5, facingDeg: 180 }, o2: { x: 0.58, y: 0.5, facingDeg: 180 } })),
        kf(T6[2], poses({ o2: { x: 0.55, y: 0.5, facingDeg: 180 }, o3: { x: 0.55, y: 0.52, facingDeg: 190 }, o4: { x: 0.58, y: 0.78, facingDeg: 190 }, o1: { x: 0.7, y: 0.22, facingDeg: 180 } })),
        kf(T6[3], poses({ o3: { x: 0.52, y: 0.52, facingDeg: 190 }, d3: { x: 0.49, y: 0.5, facingDeg: 0 }, d4: { x: 0.46, y: 0.64, facingDeg: 0 } })),
        kf(T6[4], poses({ o3: { x: 0.53, y: 0.5, facingDeg: 190 }, d3: { x: 0.49, y: 0.52, facingDeg: 0 }, d6: { x: 0.24, y: 0.42, facingDeg: 20 } })),
        kf(T6[5], poses({ o3: { x: 0.56, y: 0.5, facingDeg: 180 }, o2: { x: 0.6, y: 0.48, facingDeg: 180 }, d6: { x: 0.24, y: 0.4, facingDeg: 20 } })),
      ],
      events: [
        { t: 1400, kind: "pass", action: "receive", from: "o6", to: "o2", note: "六号位垫到二传窗口。" },
        { t: 3300, kind: "pass", action: "set", from: "o2", to: "o3", note: "二传抢节奏给副攻短平快。" },
        { t: 4200, kind: "screen", from: "d3", angle: 90, note: "对手中拦跟快球。" },
        { t: 6200, kind: "finish_options", from: "o3", note: "副攻快球落点。", options: [
          { kind: "shot", label: "三米线后", x: 0.32, y: 0.42, priority: "primary" },
          { kind: "shot", label: "腰线", x: 0.24, y: 0.58, priority: "counter" },
        ] },
      ],
      ...COMMON_DOC,
    },
  },
  {
    id: "pipe-attack",
    nameKey: "tpl.pipeAttack.name",
    descKey: "tpl.pipeAttack.desc",
    document: {
      schemaVersion: 1,
      meta: {
        name: "Pipe 后排进攻",
        description: "四号位假拉开牵制边拦，六号位从后排插上打 pipe，二传保持球速和线路。",
        category: "后排进攻",
        tags: ["pipe", "back-row", "tempo"],
        court: FULL_COURT,
        durationMs: 8000,
      },
      teams: BASE_TEAMS,
      actors: [...ACTORS, ball("o5")],
      keyframes: [
        kf(T6[0], poses({ o5: { x: 0.82, y: 0.7, facingDeg: 180 }, o6: { x: 0.9, y: 0.5, facingDeg: 180 } })),
        kf(T6[1], poses({ o5: { x: 0.78, y: 0.7, facingDeg: 178 }, o2: { x: 0.58, y: 0.48, facingDeg: 180 }, o6: { x: 0.82, y: 0.5, facingDeg: 180 } })),
        kf(T6[2], poses({ o2: { x: 0.55, y: 0.48, facingDeg: 180 }, o4: { x: 0.56, y: 0.78, facingDeg: 205 }, o6: { x: 0.74, y: 0.5, facingDeg: 185, cpx: 0.8, cpy: 0.5 } })),
        kf(T6[3], poses({ o6: { x: 0.72, y: 0.5, facingDeg: 190 }, o4: { x: 0.52, y: 0.78, facingDeg: 210 }, d3: { x: 0.49, y: 0.52, facingDeg: 0 }, d4: { x: 0.49, y: 0.75, facingDeg: 0 } })),
        kf(T6[4], poses({ o6: { x: 0.71, y: 0.5, facingDeg: 190 }, d3: { x: 0.48, y: 0.5, facingDeg: 0 }, d5: { x: 0.22, y: 0.34, facingDeg: 15 }, d6: { x: 0.2, y: 0.62, facingDeg: 18 } })),
        kf(T6[5], poses({ o6: { x: 0.72, y: 0.5, facingDeg: 180 }, o4: { x: 0.57, y: 0.74, facingDeg: 200 }, d5: { x: 0.2, y: 0.34, facingDeg: 15 }, d6: { x: 0.18, y: 0.62, facingDeg: 18 } })),
      ],
      events: [
        { t: 1300, kind: "pass", action: "receive", from: "o5", to: "o2", note: "五号位一传到二传点。" },
        { t: 3400, kind: "pass", action: "set", from: "o2", to: "o6", note: "二传反节奏给六号位三米线后 pipe。" },
        { t: 4300, kind: "screen", from: "d3", angle: 90, note: "中拦判断后排进攻。" },
        { t: 6300, kind: "finish_options", from: "o6", note: "Pipe 进攻落点。", options: [
          { kind: "shot", label: "中后", x: 0.18, y: 0.5, priority: "primary" },
          { kind: "shot", label: "一号位", x: 0.24, y: 0.22, priority: "counter" },
          { kind: "shot", label: "五号位", x: 0.24, y: 0.78, priority: "counter" },
        ] },
      ],
      ...COMMON_DOC,
    },
  },
  {
    id: "block-dig-transition",
    nameKey: "tpl.blockDig.name",
    descKey: "tpl.blockDig.desc",
    document: {
      schemaVersion: 1,
      meta: {
        name: "双人拦网 + 防反转换",
        description: "对手四号位强攻，本队三四号位并拦，五号位卡斜线防起后快速转入二传组织。",
        category: "拦防体系",
        tags: ["block", "dig", "transition"],
        court: FULL_COURT,
        durationMs: 8000,
      },
      teams: BASE_TEAMS,
      actors: [...ACTORS, ball("d4")],
      keyframes: [
        kf(T6[0], poses({ d4: { x: 0.42, y: 0.76, facingDeg: 0 }, o3: { x: 0.56, y: 0.55, facingDeg: 180 }, o4: { x: 0.56, y: 0.74, facingDeg: 180 }, o5: { x: 0.82, y: 0.72, facingDeg: 180 } })),
        kf(T6[1], poses({ d4: { x: 0.47, y: 0.78, facingDeg: 0 }, o3: { x: 0.52, y: 0.58, facingDeg: 180 }, o4: { x: 0.52, y: 0.76, facingDeg: 180 }, o5: { x: 0.78, y: 0.7, facingDeg: 180 } })),
        kf(T6[2], poses({ o3: { x: 0.51, y: 0.6, facingDeg: 180 }, o4: { x: 0.51, y: 0.76, facingDeg: 180 }, o5: { x: 0.72, y: 0.68, facingDeg: 170 }, o6: { x: 0.84, y: 0.48, facingDeg: 180 } })),
        kf(T6[3], poses({ o5: { x: 0.72, y: 0.64, facingDeg: 165 }, o2: { x: 0.58, y: 0.48, facingDeg: 180 }, o1: { x: 0.72, y: 0.24, facingDeg: 180 } })),
        kf(T6[4], poses({ o2: { x: 0.55, y: 0.48, facingDeg: 180 }, o1: { x: 0.56, y: 0.24, facingDeg: 190 }, d2: { x: 0.49, y: 0.26, facingDeg: 0 }, d3: { x: 0.48, y: 0.48, facingDeg: 0 } })),
        kf(T6[5], poses({ o1: { x: 0.54, y: 0.24, facingDeg: 200 }, o5: { x: 0.8, y: 0.66, facingDeg: 170 }, d5: { x: 0.22, y: 0.32, facingDeg: 20 }, d6: { x: 0.2, y: 0.62, facingDeg: 18 } })),
      ],
      events: [
        { t: 1200, kind: "pass", action: "attack", from: "d4", to: "o5", note: "对手四号位强攻，本队后排防起。" },
        { t: 1500, kind: "screen", from: "o3", angle: 270, note: "本队副攻封斜线。" },
        { t: 1500, kind: "screen", from: "o4", angle: 270, note: "本队四号位并拦压直线。" },
        { t: 3300, kind: "pass", action: "receive", from: "o5", to: "o2", note: "五号位防起到二传点。" },
        { t: 5200, kind: "pass", action: "set", from: "o2", to: "o1", note: "二传反向给二号位反击。" },
        { t: 6500, kind: "finish_options", from: "o1", note: "防反二号位选择。", options: [
          { kind: "shot", label: "小斜线", x: 0.3, y: 0.38, priority: "primary" },
          { kind: "shot", label: "直线", x: 0.18, y: 0.18, priority: "counter" },
          { kind: "shot", label: "吊二传身后", x: 0.46, y: 0.5, priority: "counter" },
        ] },
      ],
      ...COMMON_DOC,
    },
  },
];
