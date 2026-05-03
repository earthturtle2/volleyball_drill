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

const event = z
  .object({
    t: z.number().int().min(0),
    kind: z.string().min(1),
    from: z.string().optional(),
    to: z.string().optional(),
    note: z.string().optional(),
    angle: z.number().optional(),
  })
  .passthrough();

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
    const teamCounts = { offense: 0, defense: 0 };
    let ballCount = 0;

    doc.actors.forEach((a, i) => {
      if (actorIds.has(a.id)) {
        addCustomIssue(ctx, ["actors", i, "id"], `actor id 重复: ${a.id}`);
      }
      actorIds.add(a.id);
      if (a.type === "player") {
        playerIds.add(a.id);
        teamCounts[a.team] += 1;
      } else {
        ballCount += 1;
      }
    });

    if (teamCounts.offense > 6) {
      addCustomIssue(ctx, ["actors"], "本方球员不能超过 6 人");
    }
    if (teamCounts.defense > 6) {
      addCustomIssue(ctx, ["actors"], "对方球员不能超过 6 人");
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

    doc.events?.forEach((ev, i) => {
      if (ev.t > timelineEnd) {
        addCustomIssue(ctx, ["events", i, "t"], "事件时间不能超过战术时长");
      }

      if (ev.kind === "pass") {
        requirePlayerRef(ev.from, ["events", i, "from"], "传球发起人");
        requirePlayerRef(ev.to, ["events", i, "to"], "传球接收人");
        return;
      }

      if (ev.kind === "possess") {
        requirePlayerRef(ev.to, ["events", i, "to"], "触球人");
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
