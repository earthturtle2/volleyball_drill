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

type BallLineStyle = {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
};

function eventText(ev: NonNullable<TacticDocumentV1["events"]>[number]) {
  const raw = ev as { action?: unknown; subtype?: unknown; note?: unknown };
  return [ev.kind, raw.action, raw.subtype, raw.note]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
}

function inferBallLineStyle(ev: NonNullable<TacticDocumentV1["events"]>[number]): BallLineStyle {
  const text = eventText(ev);
  if (/\bserve|发球|跳飘|大力跳发/.test(text)) {
    return { stroke: "rgba(56,189,248,0.78)", strokeWidth: 0.95, strokeDasharray: "5 2", opacity: 0.86 };
  }
  if (/\breceive|first_pass|一传|接发|垫到/.test(text)) {
    return { stroke: "rgba(96,165,250,0.72)", strokeWidth: 0.8, strokeDasharray: "2 1.4", opacity: 0.8 };
  }
  if (/\bset|二传|快球|拉开|pipe/.test(text)) {
    return { stroke: "rgba(250,204,21,0.72)", strokeWidth: 0.85, strokeDasharray: "3 1.5", opacity: 0.82 };
  }
  if (/\battack|扣|强攻|进攻|hit|spike/.test(text)) {
    return { stroke: "rgba(248,113,113,0.76)", strokeWidth: 1.05, opacity: 0.88 };
  }
  if (/\btip|吊|抹/.test(text)) {
    return { stroke: "rgba(251,146,60,0.72)", strokeWidth: 0.75, strokeDasharray: "1 1.6", opacity: 0.8 };
  }
  if (/\bdig|防起|救球/.test(text)) {
    return { stroke: "rgba(147,197,253,0.74)", strokeWidth: 0.8, strokeDasharray: "2.5 1.5", opacity: 0.8 };
  }
  if (/\bcover|保护/.test(text)) {
    return { stroke: "rgba(191,219,254,0.66)", strokeWidth: 0.7, strokeDasharray: "1 2", opacity: 0.72 };
  }
  return { stroke: "rgba(255,200,60,0.5)", strokeWidth: 0.8, strokeDasharray: "3 2", opacity: 0.72 };
}

function isBallLineEvent(e: NonNullable<TacticDocumentV1["events"]>[number]) {
  if (!e.from || !e.to) return false;
  if (e.kind === "pass" || e.kind === "ball_action") return true;
  return /\b(serve|receive|first_pass|set|attack|tip|dig|cover)\b/.test(eventText(e));
}

export function PassLines({ document, courtMode = "half", visibleUpToTimeMs }: Props) {
  const filtered = useMemo(() => {
    const passes = (document.events ?? []).filter(isBallLineEvent);
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
        const style = inferBallLineStyle(ev);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={style.stroke}
            strokeWidth={style.strokeWidth}
            strokeDasharray={style.strokeDasharray}
            opacity={style.opacity}
            markerEnd="url(#arrow)"
          />
        );
      })}
    </g>
  );
}
