/**
 * Volleyball court geometry in decimeters.
 * Half court: viewBox 0 0 90 90 (9m x 9m).
 * Full court: viewBox 0 0 180 90 (18m x 9m).
 * Origin top-left, x right, y down.
 */

import type { TacticDocumentV1 } from "@volleyball/shared";

export const HALF_W = 90;
export const FULL_W = 180;
export const COURT_H = 90;
export const ATTACK_LINE_FROM_NET = 30;

export type CourtMode = "half" | "full";

/** 与编辑页一致：半场/全场写入 `meta.court.preset`，分享页等只读预览由此读取。 */
export function courtModeFromDocument(doc: TacticDocumentV1): CourtMode {
  const p = doc.meta?.court?.preset;
  if (p === "half") return "half";
  return "full";
}

export function courtWidth(mode: CourtMode): number {
  return mode === "full" ? FULL_W : HALF_W;
}

export function tacticToSvg(tx: number, ty: number, mode: CourtMode = "full"): [number, number] {
  return [tx * courtWidth(mode), (1 - ty) * COURT_H];
}

export function svgToTactic(sx: number, sy: number, mode: CourtMode = "full"): [number, number] {
  const w = courtWidth(mode);
  return [
    Math.max(0, Math.min(1, sx / w)),
    Math.max(0, Math.min(1, 1 - sy / COURT_H)),
  ];
}

export interface CourtPathSet {
  boundary: string;
  netLine: string;
  attackLines: string[];
  serviceGuides: string[];
}

export function courtPaths(mode: CourtMode = "full"): CourtPathSet {
  const w = courtWidth(mode);
  const netX = mode === "full" ? w / 2 : 0;
  const attackLines = mode === "full"
    ? [netX - ATTACK_LINE_FROM_NET, netX + ATTACK_LINE_FROM_NET]
    : [ATTACK_LINE_FROM_NET];

  return {
    boundary: `M 0 0 H ${w} V ${COURT_H} H 0 Z`,
    netLine: `M ${netX} 0 V ${COURT_H}`,
    attackLines: attackLines.map((x) => `M ${x} 0 V ${COURT_H}`),
    serviceGuides: mode === "full"
      ? [`M 0 18 H 8`, `M 0 72 H 8`, `M ${w} 18 H ${w - 8}`, `M ${w} 72 H ${w - 8}`]
      : [`M ${w} 18 H ${w - 8}`, `M ${w} 72 H ${w - 8}`],
  };
}
