import { forwardRef, useMemo, type ReactNode } from "react";
import {
  ATTACK_LINE_FROM_NET,
  COURT_H,
  courtPaths,
  courtWidth,
  type CourtMode,
} from "./court-geometry";

interface Props {
  mode?: CourtMode;
  children?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
}

const LINE = "rgba(240,249,255,0.74)";
const LINE_THIN = "rgba(240,249,255,0.42)";
const NET = "rgba(250,204,21,0.9)";

function frontZones(mode: CourtMode, w: number) {
  if (mode === "full") {
    const netX = w / 2;
    return [
      { x: netX - ATTACK_LINE_FROM_NET, width: ATTACK_LINE_FROM_NET },
      { x: netX, width: ATTACK_LINE_FROM_NET },
    ];
  }
  return [{ x: 0, width: ATTACK_LINE_FROM_NET }];
}

export const CourtSVG = forwardRef<SVGSVGElement, Props>(
  ({ mode = "full", children, className, onClick }, ref) => {
    const w = courtWidth(mode);
    const p = useMemo(() => courtPaths(mode), [mode]);
    const zones = useMemo(() => frontZones(mode, w), [mode, w]);

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${w} ${COURT_H}`}
        className={className ?? "court-svg"}
        preserveAspectRatio="xMidYMid meet"
        onClick={onClick}
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <path d="M0,0 L6,2 L0,4" fill="rgba(250,204,21,0.92)" />
          </marker>
          <marker id="moveArrowOff" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0.5 L4,2 L0,3.5" fill="rgba(240,249,255,0.72)" />
          </marker>
          <linearGradient id="courtGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="48%" stopColor="#0e7490" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#075985" stopOpacity="0.28" />
          </linearGradient>
          <pattern id="courtGrain" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.35" />
          </pattern>
        </defs>

        <rect width={w} height={COURT_H} fill="#0b5f9f" rx="1" />
        <rect width={w} height={COURT_H} fill="url(#courtGrad)" rx="1" />
        <rect width={w} height={COURT_H} fill="url(#courtGrain)" rx="1" />

        {zones.map((zone, idx) => (
          <rect
            key={idx}
            x={zone.x}
            y="0"
            width={zone.width}
            height={COURT_H}
            fill="rgba(125, 211, 252, 0.14)"
          />
        ))}

        <path d={p.boundary} fill="none" stroke={LINE} strokeWidth="0.8" />
        {p.attackLines.map((d, idx) => (
          <path key={idx} d={d} stroke={LINE} strokeWidth="0.62" strokeDasharray="3 2" />
        ))}
        {p.serviceGuides.map((d, idx) => (
          <path key={idx} d={d} stroke={LINE_THIN} strokeWidth="0.5" />
        ))}
        <path d={p.netLine} stroke={NET} strokeWidth="1.2" />
        <path d={p.netLine} stroke="rgba(15,23,42,0.38)" strokeWidth="0.25" strokeDasharray="1.2 1.2" />

        <g fill="rgba(240,249,255,0.5)" fontSize="4" fontWeight="700" letterSpacing="0.6" style={{ pointerEvents: "none" }}>
          <text x={mode === "full" ? w / 2 + 3 : 3} y="8">NET</text>
          {p.attackLines.map((_, idx) => {
            const x = mode === "full"
              ? (idx === 0 ? w / 2 - ATTACK_LINE_FROM_NET - 9 : w / 2 + ATTACK_LINE_FROM_NET + 2)
              : ATTACK_LINE_FROM_NET + 2;
            return <text key={idx} x={x} y="86">3m</text>;
          })}
        </g>

        {children}
      </svg>
    );
  },
);

CourtSVG.displayName = "CourtSVG";
