import type { TacticDocumentV1 } from "@volleyball/shared";

type Vec = { x: number; y: number; facingDeg?: number };
type EventRow = NonNullable<TacticDocumentV1["events"]>[number];
type BallTransferEvent = EventRow & { from: string; to: string };

function lerp(a: number, b: number, s: number) {
  return a + (b - a) * s;
}

function quadBezier(a: number, cp: number, b: number, t: number) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * cp + t * t * b;
}

function lerpAngle(a: number, b: number, s: number) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * s;
}

export function samplePoses(
  document: TacticDocumentV1,
  tMs: number,
): Record<string, Vec> {
  const kf = [...document.keyframes].sort((a, b) => a.t - b.t);
  if (kf.length === 0) return {};
  if (tMs <= kf[0]!.t) {
    return { ...kf[0]!.poses };
  }
  if (tMs >= kf[kf.length - 1]!.t) {
    return { ...kf[kf.length - 1]!.poses };
  }
  let i = 0;
  for (let j = 0; j < kf.length - 1; j++) {
    if (kf[j]!.t <= tMs && tMs < kf[j + 1]!.t) {
      i = j;
      break;
    }
  }
  const a = kf[i]!;
  const b = kf[i + 1]!;
  const s = (tMs - a.t) / (b.t - a.t);
  const ids = new Set([...Object.keys(a.poses), ...Object.keys(b.poses)]);
  const out: Record<string, Vec> = {};
  for (const id of ids) {
    const pa = a.poses[id];
    const pb = b.poses[id];
    if (pa && pb) {
      const hasCp = pb.cpx !== undefined && pb.cpy !== undefined;
      out[id] = {
        x: hasCp ? quadBezier(pa.x, pb.cpx!, pb.x, s) : lerp(pa.x, pb.x, s),
        y: hasCp ? quadBezier(pa.y, pb.cpy!, pb.y, s) : lerp(pa.y, pb.y, s),
        facingDeg:
          pa.facingDeg !== undefined && pb.facingDeg !== undefined
            ? lerpAngle(pa.facingDeg, pb.facingDeg, s)
            : (pa.facingDeg ?? pb.facingDeg),
      };
    } else {
      out[id] = (pa ?? pb)!;
    }
  }
  return out;
}

/** Maximum visual flight duration (ms). */
const PASS_FLY_MS = 400;

/**
 * Flight duration for a pass that **arrives** at `passT`.
 * Capped to the previous-keyframe gap so the flight fits within the segment
 * leading up to the pass keyframe.
 */
export function passFlyMs(doc: TacticDocumentV1, passT: number): number {
  const times = doc.keyframes.map((k) => k.t).sort((a, b) => a - b);
  const prevTimes = times.filter((t) => t < passT);
  if (prevTimes.length > 0) return Math.min(PASS_FLY_MS, passT - prevTimes[prevTimes.length - 1]!);
  const nextT = times.find((t) => t > passT);
  if (nextT !== undefined) return Math.min(PASS_FLY_MS, nextT - passT);
  return PASS_FLY_MS;
}

/** Timeline end (ms): max of declared duration and last keyframe. */
export function playbackEndMs(doc: TacticDocumentV1): number {
  const dur = doc.meta?.durationMs ?? 0;
  const kfMax = doc.keyframes.length ? Math.max(...doc.keyframes.map((k) => k.t)) : 0;
  return Math.max(dur, kfMax);
}

function isBallTransferEvent(e: EventRow): e is BallTransferEvent {
  return (e.kind === "pass" || e.kind === "ball_action") && Boolean(e.from && e.to);
}

function isBlockStartEvent(e: EventRow): boolean {
  return e.kind === "screen" || e.kind === "block";
}

function isBlockEndEvent(e: EventRow): boolean {
  return e.kind === "screen_end" || e.kind === "block_end";
}

/**
 * The pass currently in the air at tMs, if any.
 * Flight occupies [passT − flyMs, passT). The ball arrives at passT.
 */
export function findInFlightPass(
  doc: TacticDocumentV1,
  tMs: number,
): { t: number; from: string; to: string; flightStart: number } | null {
  const passes = (doc.events ?? [])
    .filter(isBallTransferEvent)
    .sort((a, b) => a.t - b.t);
  let best: (typeof passes)[0] | null = null;
  let bestStart = 0;
  for (const p of passes) {
    const flyMs = passFlyMs(doc, p.t);
    const start = Math.max(0, p.t - flyMs);
    if (start > tMs) continue;
    if (tMs < p.t) {
      if (!best || p.t > best.t) { best = p; bestStart = start; }
    }
  }
  if (!best) return null;
  return { t: best.t, from: best.from!, to: best.to!, flightStart: bestStart };
}

/**
 * Who holds the ball at t.
 * Pass ownership changes at pass.t (the ball has arrived by then).
 */
export function resolveBallHolderAt(
  doc: TacticDocumentV1,
  tMs: number,
): string | undefined {
  const ball = doc.actors.find((a) => a.type === "ball");
  let holder = ball?.type === "ball" ? ball.heldBy : undefined;
  const all = doc.events ?? [];
  const withIdx = all.map((e, i) => ({ e, i }));
  const chain = withIdx
    .filter(
      ({ e }) =>
        isBallTransferEvent(e) ||
        (e.kind === "possess" && e.to) ||
        e.kind === "possess_end",
    )
    .filter(({ e }) => e.t <= tMs)
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  for (const { e } of chain) {
    if (isBallTransferEvent(e)) holder = e.to;
    else if (e.kind === "possess") holder = e.to;
    else if (e.kind === "possess_end") holder = undefined;
  }
  return holder;
}

/**
 * For each blocker (`from`), apply legacy screen or volleyball block events in
 * time order. Start events set the overlay; end events clear it.
 */
export function resolveScreenOverlaysAtT(document: TacticDocumentV1, tMs: number): Map<string, number> {
  const out = new Map<string, number>();
  const all = document.events ?? [];
  const withIdx = all.map((e, i) => ({ e, i }));
  const fromIds = new Set<string>();
  for (const { e } of withIdx) {
    if ((isBlockStartEvent(e) || isBlockEndEvent(e)) && e.from) fromIds.add(e.from);
  }
  for (const fromId of fromIds) {
    const chain = withIdx
      .filter(
        ({ e }) =>
          (isBlockStartEvent(e) || isBlockEndEvent(e)) && e.from === fromId && e.t <= tMs,
      )
      .sort((a, b) => a.e.t - b.e.t || a.i - b.i);
    let angle: number | null = null;
    for (const { e } of chain) {
      if (isBlockStartEvent(e)) angle = e.angle ?? 0;
      else if (isBlockEndEvent(e)) angle = null;
    }
    if (angle !== null) out.set(fromId, angle);
  }
  return out;
}

/**
 * The `doc.events` index of the active block marker row at tMs for `fromId`, or null.
 */
export function getActiveScreenEventIndex(
  events: NonNullable<TacticDocumentV1["events"]> | undefined,
  fromId: string,
  tMs: number,
): number | null {
  if (!events?.length) return null;
  const withIdx = events.map((e, i) => ({ e, i }));
  const chain = withIdx
    .filter(
      ({ e }) =>
        (isBlockStartEvent(e) || isBlockEndEvent(e)) && e.from === fromId && e.t <= tMs,
    )
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  let activeIdx: number | null = null;
  for (const { e, i } of chain) {
    if (isBlockStartEvent(e)) activeIdx = i;
    else if (isBlockEndEvent(e)) activeIdx = null;
  }
  return activeIdx;
}

export interface BallFlightInfo {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
}

export function resolveBallState(
  doc: TacticDocumentV1,
  tMs: number,
  poses: Record<string, Vec>,
): { holder: string | undefined; flight?: BallFlightInfo } {
  const inflight = findInFlightPass(doc, tMs);
  if (inflight) {
    const flyDur = inflight.t - inflight.flightStart;
    const progress = flyDur > 0 ? (tMs - inflight.flightStart) / flyDur : 1;
    const fp = poses[inflight.from];
    const tp = poses[inflight.to];
    if (fp && tp) {
      return {
        holder: undefined,
        flight: {
          fromX: fp.x,
          fromY: fp.y,
          toX: tp.x,
          toY: tp.y,
          progress,
        },
      };
    }
  }
  return { holder: resolveBallHolderAt(doc, tMs) };
}
