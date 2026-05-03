import type { TacticDocumentV1 } from "@volleyball/shared";
import { findInFlightPass, passFlyMs, resolveBallHolderAt } from "./viewer-math";

export type SvgPoint = [number, number];

export interface MovementTrailPiece {
  start: SvgPoint;
  end: SvgPoint;
  cp: SvgPoint | null;
  points: SvgPoint[];
  isDuringTouch: boolean;
}

interface QuadraticCurve {
  p0: SvgPoint;
  cp: SvgPoint;
  p1: SvgPoint;
}

const STATE_SAMPLE_EPS_MS = 0.5;
const MIN_PIECE_MS = 0.5;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPoint(a: SvgPoint, b: SvgPoint, t: number): SvgPoint {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function splitQuadratic(curve: QuadraticCurve, u: number): { left: QuadraticCurve; right: QuadraticCurve } {
  const t = clamp01(u);
  const p01 = lerpPoint(curve.p0, curve.cp, t);
  const p12 = lerpPoint(curve.cp, curve.p1, t);
  const p0112 = lerpPoint(p01, p12, t);
  return {
    left: { p0: curve.p0, cp: p01, p1: p0112 },
    right: { p0: p0112, cp: p12, p1: curve.p1 },
  };
}

function sliceQuadratic(p0: SvgPoint, cp: SvgPoint, p1: SvgPoint, u0: number, u1: number): QuadraticCurve {
  const start = clamp01(u0);
  const end = clamp01(u1);
  const base = { p0, cp, p1 };
  const left = end < 1 ? splitQuadratic(base, end).left : base;
  if (start <= 0) return left;
  return splitQuadratic(left, start / end).right;
}

export function sampleQuadBezier(
  p0: SvgPoint,
  cp: SvgPoint,
  p1: SvgPoint,
  n: number = 24,
): SvgPoint[] {
  const pts: SvgPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1],
    ]);
  }
  return pts;
}

export function polylinePathD(points: SvgPoint[]): string {
  if (points.length < 2) return "";
  return points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(" ");
}

function isMovementDuringTouch(doc: TacticDocumentV1, actorId: string, tMs: number): boolean {
  // Movement style follows volleyball touch moments, not keyframe boundaries.
  // During ball flight nobody is shown as touching the ball; the receiver touch starts at pass.t.
  if (findInFlightPass(doc, tMs)) return false;
  return resolveBallHolderAt(doc, tMs) === actorId;
}

function eventSplitCandidates(doc: TacticDocumentV1, t0: number, t1: number): number[] {
  const candidates: number[] = [];
  for (const e of doc.events ?? []) {
    if ((e.kind === "pass" || e.kind === "ball_action") && e.from && e.to) {
      const flightStart = Math.max(0, e.t - passFlyMs(doc, e.t));
      candidates.push(flightStart, e.t);
    } else if (e.kind === "possess" || e.kind === "possess_end") {
      candidates.push(e.t);
    }
  }
  return [...new Set(candidates)]
    .filter((t) => t > t0 && t < t1)
    .sort((a, b) => a - b);
}

function actorMovementSplitTimes(doc: TacticDocumentV1, actorId: string, t0: number, t1: number): number[] {
  return eventSplitCandidates(doc, t0, t1).filter((t) => {
    const beforeDt = Math.min(STATE_SAMPLE_EPS_MS, (t - t0) / 2);
    const afterDt = Math.min(STATE_SAMPLE_EPS_MS, (t1 - t) / 2);
    const before = isMovementDuringTouch(doc, actorId, t - beforeDt);
    const after = isMovementDuringTouch(doc, actorId, t + afterDt);
    return before !== after;
  });
}

export function movementTrailPieces({
  doc,
  actorId,
  t0,
  t1,
  p0,
  p1,
  cp,
}: {
  doc: TacticDocumentV1;
  actorId: string;
  t0: number;
  t1: number;
  p0: SvgPoint;
  p1: SvgPoint;
  cp: SvgPoint | null;
}): MovementTrailPiece[] {
  if (t1 <= t0) return [];
  const duration = t1 - t0;
  const times = [t0, ...actorMovementSplitTimes(doc, actorId, t0, t1), t1];
  const pieces: MovementTrailPiece[] = [];

  for (let i = 1; i < times.length; i++) {
    const startT = times[i - 1]!;
    const endT = times[i]!;
    if (endT - startT <= MIN_PIECE_MS) continue;

    const u0 = (startT - t0) / duration;
    const u1 = (endT - t0) / duration;
    const isDuringTouch = isMovementDuringTouch(doc, actorId, (startT + endT) / 2);

    if (cp) {
      const curve = sliceQuadratic(p0, cp, p1, u0, u1);
      pieces.push({
        start: curve.p0,
        end: curve.p1,
        cp: curve.cp,
        points: sampleQuadBezier(curve.p0, curve.cp, curve.p1, 30),
        isDuringTouch,
      });
    } else {
      const start = lerpPoint(p0, p1, u0);
      const end = lerpPoint(p0, p1, u1);
      pieces.push({
        start,
        end,
        cp: null,
        points: [start, end],
        isDuringTouch,
      });
    }
  }

  return pieces;
}
