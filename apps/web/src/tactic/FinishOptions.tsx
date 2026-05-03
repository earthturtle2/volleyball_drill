import type { TacticDocumentV1 } from "@volleyball/shared";
import { useMemo, type ReactNode } from "react";
import { tacticToSvg, type CourtMode } from "./court-geometry";
import { parseFinishOptionsEvent, type FinishOption, type FinishOptionsEvent } from "./finish-options-data";
import { samplePoses } from "./viewer-math";

type Vec = { x: number; y: number };

interface Props {
  document: TacticDocumentV1;
  courtMode?: CourtMode;
  visibleAtTimeMs: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function optionTarget(option: FinishOption, poses: Record<string, Vec>): Vec | null {
  if (option.to && poses[option.to]) return poses[option.to]!;
  if (option.x !== undefined && option.y !== undefined) {
    return { x: clamp01(option.x), y: clamp01(option.y) };
  }
  return null;
}

export function FinishOptions({ document, courtMode = "half", visibleAtTimeMs }: Props) {
  const event = useMemo(() => {
    const optionsEvents = (document.events ?? [])
      .map(parseFinishOptionsEvent)
      .filter((item): item is FinishOptionsEvent => Boolean(item))
      .filter((item) => item.t <= visibleAtTimeMs)
      .sort((a, b) => a.t - b.t);
    return optionsEvents.at(-1) ?? null;
  }, [document.events, visibleAtTimeMs]);

  if (!event) return null;

  const poses = samplePoses(document, visibleAtTimeMs);
  const fromPose = event.from ? poses[event.from] : undefined;
  const fromSvg = fromPose ? tacticToSvg(fromPose.x, fromPose.y, courtMode) : null;
  const nodes: ReactNode[] = [];

  if (fromSvg) {
    nodes.push(
      <g key="finish-source">
        <circle
          cx={fromSvg[0]}
          cy={fromSvg[1]}
          r={5.5}
          fill="rgba(255, 213, 79, 0.08)"
          stroke="#ffd54f"
          strokeWidth="0.6"
          strokeDasharray="2 1.6"
        />
      </g>,
    );
  }

  event.options.forEach((option, idx) => {
    const target = optionTarget(option, poses);
    if (!target) return;

    const [tx, ty] = tacticToSvg(target.x, target.y, courtMode);
    const isShot = option.kind === "shot";
    const isPrimary = option.priority === "primary" || isShot;
    const stroke = isShot ? "#ff7043" : "#4dd0e1";
    const fill = isShot ? "rgba(255, 112, 67, 0.16)" : "rgba(77, 208, 225, 0.14)";

    nodes.push(
      <g key={`finish-option-${idx}`}>
        {fromSvg ? (
          <line
            x1={fromSvg[0]}
            y1={fromSvg[1]}
            x2={tx}
            y2={ty}
            stroke={stroke}
            strokeWidth={isPrimary ? 0.95 : 0.75}
            strokeDasharray={isShot ? "1.2 1.4" : "3 2"}
            opacity={isPrimary ? 0.82 : 0.68}
            markerEnd={isShot ? undefined : "url(#arrow)"}
          />
        ) : null}

        {isShot ? (
          <g transform={`translate(${tx}, ${ty})`}>
            <circle r={3.8} fill={fill} stroke={stroke} strokeWidth="0.75" />
            <circle r={1.6} fill="none" stroke={stroke} strokeWidth="0.6" />
            <line x1={-4.8} y1={0} x2={4.8} y2={0} stroke={stroke} strokeWidth="0.45" strokeLinecap="round" />
            <line x1={0} y1={-4.8} x2={0} y2={4.8} stroke={stroke} strokeWidth="0.45" strokeLinecap="round" />
          </g>
        ) : (
          <g transform={`translate(${tx}, ${ty})`}>
            <circle r={3.6} fill={fill} stroke={stroke} strokeWidth="0.65" />
            <path d="M -1.8 -2.1 L 2.3 0 L -1.8 2.1 Z" fill={stroke} opacity="0.95" />
          </g>
        )}
      </g>,
    );
  });

  return <g className="finish-options" style={{ pointerEvents: "none" }}>{nodes}</g>;
}
