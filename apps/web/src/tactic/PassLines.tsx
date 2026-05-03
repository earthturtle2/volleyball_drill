import type { TacticDocumentV1 } from "@volleyball/shared";
import { useMemo } from "react";
import { samplePoses } from "./viewer-math";
import { tacticToSvg, type CourtMode } from "./court-geometry";

interface Props {
  document: TacticDocumentV1;
  courtMode?: CourtMode;
  /**
   * Editor: only show passes whose event time is at or before this moment (ms),
   * i.e. passes that have “already happened” when viewing the active keyframe.
   * Omit in contexts where all passes should be drawn (e.g. if reused elsewhere).
   */
  visibleUpToTimeMs?: number;
}

export function PassLines({ document, courtMode = "half", visibleUpToTimeMs }: Props) {
  const filtered = useMemo(() => {
    const passes = (document.events ?? []).filter(
      (e) => e.kind === "pass" && e.from && e.to,
    );
    return visibleUpToTimeMs === undefined
      ? passes
      : passes.filter((e) => e.t <= visibleUpToTimeMs);
  }, [document.events, visibleUpToTimeMs]);
  const posesByTime = useMemo(() => {
    const out = new Map<number, ReturnType<typeof samplePoses>>();
    for (const ev of filtered) {
      if (!out.has(ev.t)) out.set(ev.t, samplePoses(document, ev.t));
    }
    return out;
  }, [document, filtered]);
  if (filtered.length === 0) return null;

  return (
    <g className="pass-lines">
      {filtered.map((ev, i) => {
        const poses = posesByTime.get(ev.t);
        if (!poses) return null;
        const fromP = poses[ev.from!];
        const toP = poses[ev.to!];
        if (!fromP || !toP) return null;
        const [x1, y1] = tacticToSvg(fromP.x, fromP.y, courtMode);
        const [x2, y2] = tacticToSvg(toP.x, toP.y, courtMode);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,200,60,0.5)"
            strokeWidth="0.8"
            strokeDasharray="3 2"
            markerEnd="url(#arrow)"
          />
        );
      })}
    </g>
  );
}
