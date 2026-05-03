import { z } from "zod";

const vec2d = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  facingDeg: z.number().optional(),
  cpx: z.number().optional(),
  cpy: z.number().optional(),
});

const keyframe = z.object({
  t: z.number().int().min(0),
  poses: z.record(z.string().min(1), vec2d),
});

const volleyballBallActionValues = [
  "serve",
  "receive",
  "first_pass",
  "set",
  "attack",
  "spike",
  "tip",
  "dig",
  "cover",
  "free_ball",
] as const;

const eventKindValues = [
  "pass",
  "ball_action",
  "block",
  "block_end",
  "screen",
  "screen_end",
  "possess",
  "possess_end",
  "finish_options",
] as const;

const event = z
  .object({
    t: z.number().int().min(0),
    kind: z.enum(eventKindValues),
    action: z.enum(volleyballBallActionValues).optional(),
    subtype: z.enum(volleyballBallActionValues).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    note: z.string().optional(),
    angle: z.number().optional(),
    options: z.unknown().optional(),
  })
  .passthrough();

const volleyballBallActions = new Set<string>(volleyballBallActionValues);

const forbiddenBasketballTerms = /\b(dribble|crossover|drive|layup|screen\s*roll|pick\s*and\s*roll)\b|运球|突破|上篮|挡拆/iu;
const finishOptionKinds = new Set(["shot", "pass", "tip", "cover"]);
const finishOptionPriorities = new Set(["primary", "counter", "safety"]);

const actor = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("player"),
    team: z.enum(["offense", "defense"]),
    rosterPlayerId: z.string().min(1).optional(),
    number: z.number().int().min(0).max(99),
    label: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("ball"),
    heldBy: z.string().optional(),
  }),
]);

function addCustomIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function readStringProp(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : undefined;
}

function readArrayProp(value: unknown, key: string): unknown[] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw : undefined;
}

function readNumberProp(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export const TacticDocumentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    meta: z
      .object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        category: z.string().max(64).optional(),
        tags: z.array(z.string().max(64)).max(32).optional(),
        court: z
          .object({
            preset: z.string().optional(),
            orientation: z.string().optional(),
            sizeMeters: z
              .object({
                length: z.number().positive(),
                width: z.number().positive(),
              })
              .optional(),
          })
          .passthrough()
          .optional(),
        durationMs: z.number().int().min(0).max(3600_000).optional(),
      })
      .passthrough(),
    teams: z
      .object({
        offense: z
          .object({ id: z.string(), label: z.string(), color: z.string().optional() })
          .passthrough(),
        defense: z
          .object({ id: z.string(), label: z.string(), color: z.string().optional() })
          .passthrough(),
      })
      .passthrough(),
    actors: z.array(actor).max(32),
    keyframes: z.array(keyframe).min(1).max(500),
    events: z.array(event).max(200).optional(),
    interpolation: z
      .object({
        position: z.string().optional(),
        facing: z.string().optional(),
      })
      .optional(),
    rules: z
      .object({
        coordinateSystem: z.literal("normalized"),
        bounds: z
          .object({
            x: z.tuple([z.number(), z.number()]),
            y: z.tuple([z.number(), z.number()]),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const actorIds = new Set<string>();
    const playerIds = new Set<string>();
    const playerTeams = new Map<string, "offense" | "defense">();
    const teamCounts = { offense: 0, defense: 0 };
    let ballCount = 0;

    doc.actors.forEach((a, i) => {
      if (actorIds.has(a.id)) {
        addCustomIssue(ctx, ["actors", i, "id"], `actor id 重复: ${a.id}`);
      }
      actorIds.add(a.id);
      if (a.type === "player") {
        playerIds.add(a.id);
        playerTeams.set(a.id, a.team);
        teamCounts[a.team] += 1;
      } else {
        ballCount += 1;
      }
    });

    if (teamCounts.offense > 6) {
      addCustomIssue(ctx, ["actors"], "本队球员不能超过 6 人");
    }
    if (teamCounts.defense > 6) {
      addCustomIssue(ctx, ["actors"], "对手球员不能超过 6 人");
    }
    if (ballCount > 1) {
      addCustomIssue(ctx, ["actors"], "ball actor 只能有一个");
    }

    doc.actors.forEach((a, i) => {
      if (a.type === "ball" && a.heldBy && !playerIds.has(a.heldBy)) {
        addCustomIssue(ctx, ["actors", i, "heldBy"], `触球人不存在: ${a.heldBy}`);
      }
    });

    const durationMs = doc.meta.durationMs;
    let prevT = -1;
    doc.keyframes.forEach((kf, i) => {
      if (kf.t <= prevT) {
        addCustomIssue(ctx, ["keyframes", i, "t"], "关键帧时间必须严格递增");
      }
      prevT = kf.t;
      if (durationMs !== undefined && kf.t > durationMs) {
        addCustomIssue(ctx, ["keyframes", i, "t"], "关键帧时间不能超过 durationMs");
      }
      Object.keys(kf.poses).forEach((actorId) => {
        if (!actorIds.has(actorId)) {
          addCustomIssue(ctx, ["keyframes", i, "poses", actorId], `pose 引用了不存在的 actor: ${actorId}`);
        }
      });
    });

    const lastKeyframeT = doc.keyframes.at(-1)?.t ?? 0;
    const timelineEnd = durationMs ?? lastKeyframeT;
    const requirePlayerRef = (
      value: string | undefined,
      path: Array<string | number>,
      label: string,
    ) => {
      if (!value) {
        addCustomIssue(ctx, path, `${label} 不能为空`);
        return;
      }
      if (!playerIds.has(value)) {
        addCustomIssue(ctx, path, `${label} 不存在: ${value}`);
      }
    };
    const validateFinishOptions = (ev: NonNullable<typeof doc.events>[number], i: number) => {
      requirePlayerRef(ev.from, ["events", i, "from"], "进攻选择发起人");
      const attackerTeam = ev.from ? playerTeams.get(ev.from) : undefined;
      const options = readArrayProp(ev, "options");
      if (!options) {
        addCustomIssue(ctx, ["events", i, "options"], "finish_options.options 必须是数组");
        return;
      }
      if (options.length === 0) {
        addCustomIssue(ctx, ["events", i, "options"], "finish_options.options 至少需要 1 项");
      }
      if (options.length > 12) {
        addCustomIssue(ctx, ["events", i, "options"], "finish_options.options 不能超过 12 项");
      }
      options.forEach((option, optionIdx) => {
        if (typeof option !== "object" || option === null || Array.isArray(option)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx], "进攻选择必须是对象");
          return;
        }
        const kind = readStringProp(option, "kind");
        if (!kind || !finishOptionKinds.has(kind)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "kind"], "进攻选择 kind 必须是 shot/tip 或 pass/cover");
        }
        const to = readStringProp(option, "to");
        const x = readNumberProp(option, "x");
        const y = readNumberProp(option, "y");
        if (to && !playerIds.has(to)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "to"], `进攻选择目标不存在: ${to}`);
        }
        if ((kind === "pass" || kind === "cover") && to && attackerTeam && playerTeams.get(to) !== attackerTeam) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "to"], "保护目标必须是进攻方同队球员");
        }
        if ((kind === "shot" || kind === "tip") && to) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "to"], "扣球/吊球选择应使用 x/y 标注对手场地落点");
        }
        if (x !== undefined && (x < 0 || x > 1)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "x"], "落点 x 必须在 0-1 之间");
        }
        if (y !== undefined && (y < 0 || y > 1)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "y"], "落点 y 必须在 0-1 之间");
        }
        if ((kind === "shot" || kind === "tip") && attackerTeam && x !== undefined) {
          const landsOnOpponentHalf = attackerTeam === "offense" ? x <= 0.5 : x >= 0.5;
          if (!landsOnOpponentHalf) {
            addCustomIssue(ctx, ["events", i, "options", optionIdx, "x"], "扣球/吊球落点必须在对手半场");
          }
        }
        if (!to && (x === undefined || y === undefined)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx], "进攻选择需要 to 或完整 x/y 落点");
        }
        const priority = readStringProp(option, "priority");
        if (priority && !finishOptionPriorities.has(priority)) {
          addCustomIssue(ctx, ["events", i, "options", optionIdx, "priority"], "priority 必须是 primary/counter/safety");
        }
      });
    };

    doc.events?.forEach((ev, i) => {
      if (ev.t > timelineEnd) {
        addCustomIssue(ctx, ["events", i, "t"], "事件时间不能超过战术时长");
      }

      const searchableText = [
        ev.kind,
        readStringProp(ev, "action"),
        readStringProp(ev, "subtype"),
        ev.note,
      ].filter(Boolean).join(" ");
      if (forbiddenBasketballTerms.test(searchableText)) {
        addCustomIssue(ctx, ["events", i], "事件描述不能使用运球/挡拆等非排球语义，请改为排球触球、跑动或拦网动作");
      }

      if (ev.kind === "pass") {
        const action = readStringProp(ev, "action") ?? readStringProp(ev, "subtype");
        if (action && !volleyballBallActions.has(action)) {
          addCustomIssue(ctx, ["events", i, "action"], "pass.action 必须是 serve/receive/set/attack/tip/dig/cover 等排球动作");
        }
        requirePlayerRef(ev.from, ["events", i, "from"], "球路发起人");
        requirePlayerRef(ev.to, ["events", i, "to"], "球路目标");
        return;
      }

      if (ev.kind === "ball_action") {
        const action = readStringProp(ev, "action") ?? readStringProp(ev, "subtype");
        if (!action || !volleyballBallActions.has(action)) {
          addCustomIssue(ctx, ["events", i, "action"], "ball_action.action 必须是 serve/receive/set/attack/tip/dig/cover 等排球动作");
        }
        if (ev.from) requirePlayerRef(ev.from, ["events", i, "from"], "触球发起人");
        if (ev.to) requirePlayerRef(ev.to, ["events", i, "to"], "触球目标");
        if (!ev.from && !ev.to) {
          addCustomIssue(ctx, ["events", i], "ball_action 至少需要 from 或 to");
        }
        return;
      }

      if (ev.kind === "possess") {
        requirePlayerRef(ev.to, ["events", i, "to"], "触球人");
        return;
      }

      if (ev.kind === "finish_options") {
        validateFinishOptions(ev, i);
        return;
      }

      if (ev.kind === "block" || ev.kind === "block_end") {
        requirePlayerRef(ev.from, ["events", i, "from"], "拦网球员");
        return;
      }

      if (ev.kind === "screen" || ev.kind === "screen_end") {
        requirePlayerRef(ev.from, ["events", i, "from"], "拦网球员");
        return;
      }

      if (ev.from && !playerIds.has(ev.from)) {
        addCustomIssue(ctx, ["events", i, "from"], `from 不存在: ${ev.from}`);
      }
      if (ev.to && !playerIds.has(ev.to)) {
        addCustomIssue(ctx, ["events", i, "to"], `to 不存在: ${ev.to}`);
      }
    });
  });

export type TacticDocumentV1 = z.infer<typeof TacticDocumentV1Schema>;

export function parseTacticDocumentV1(input: unknown) {
  return TacticDocumentV1Schema.parse(input);
}

export function tryParseTacticDocumentV1(
  input: unknown,
):
  | { success: true; data: TacticDocumentV1 }
  | { success: false; error: z.ZodError } {
  const r = TacticDocumentV1Schema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: r.error };
}
