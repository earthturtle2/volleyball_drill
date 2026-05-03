import type { TacticDocumentV1 } from "@volleyball/shared";
import { useMemo } from "react";
import { tacticToSvg, type CourtMode } from "./court-geometry";
import { movementTrailPieces, wavyPathD, type MovementTrailPiece } from "./movement-trails-path";

interface Props {
  document: TacticDocumentV1;
  teamColors: { offense: string; defense: string };
  courtMode?: CourtMode;
  /** In the editor, only draw segments from keyframe 0 up to this keyframe index (inclusive). Omitted = show full timeline. */
  upToKeyframeIndex?: number;
}

function renderTrailPiece(piece: MovementTrailPiece, key: string, color: string) {
  if (piece.isDribble) {
    return (
      <path
        key={key}
        d={wavyPathD(piece.points)}
        fill="none"
        stroke={color}
        strokeWidth="0.9"
        opacity="0.65"
        markerEnd="url(#moveArrowDrib)"
      />
    );
  }

  if (piece.cp) {
    return (
      <path
        key={key}
        d={`M ${piece.start[0]} ${piece.start[1]} Q ${piece.cp[0]} ${piece.cp[1]} ${piece.end[0]} ${piece.end[1]}`}
        fill="none"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.5"
        markerEnd="url(#moveArrowOff)"
      />
    );
  }

  return (
    <line
      key={key}
      x1={piece.start[0]}
      y1={piece.start[1]}
      x2={piece.end[0]}
      y2={piece.end[1]}
      stroke={color}
      strokeWidth="0.8"
      opacity="0.5"
      markerEnd="url(#moveArrowOff)"
    />
  );
}

export function MovementTrails({ document: doc, teamColors, courtMode = "half", upToKeyframeIndex }: Props) {
  const players = useMemo(() => doc.actors.filter((a) => a.type === "player"), [doc.actors]);
  const kfs = useMemo(() => [...doc.keyframes].sort((a, b) => a.t - b.t), [doc.keyframes]);
  if (kfs.length < 2) return null;

  const endSeg = upToKeyframeIndex === undefined ? kfs.length - 1 : Math.min(Math.max(0, upToKeyframeIndex), kfs.length - 1);
  if (endSeg < 1) return null;

  return (
    <g className="movement-trails">
      {players.map((actor) => {
        if (actor.type !== "player") return null;
        const color = teamColors[actor.team] ?? teamColors.offense;
        const segments: React.ReactNode[] = [];

        for (let i = 1; i <= endSeg; i++) {
          const prevPose = kfs[i - 1].poses[actor.id];
          const currPose = kfs[i].poses[actor.id];
          if (!prevPose || !currPose) continue;

          const [x0, y0] = tacticToSvg(prevPose.x, prevPose.y, courtMode);
          const [x1, y1] = tacticToSvg(currPose.x, currPose.y, courtMode);
          if (Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) < 0.5) continue;

          const cp: [number, number] | null = currPose.cpx !== undefined && currPose.cpy !== undefined
            ? tacticToSvg(currPose.cpx, currPose.cpy, courtMode)
            : null;

          const pieces = movementTrailPieces({
            doc,
            actorId: actor.id,
            t0: kfs[i - 1].t,
            t1: kfs[i].t,
            p0: [x0, y0],
            p1: [x1, y1],
            cp,
          });
          pieces.forEach((piece, partIdx) => {
            segments.push(renderTrailPiece(piece, `${actor.id}-${i}-${partIdx}`, color));
          });
        }
        return <g key={actor.id}>{segments}</g>;
      })}
    </g>
  );
}
