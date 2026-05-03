import { useCallback, useRef } from "react";

interface Props {
  actorId: string;
  cx: number;
  cy: number;
  color: string;
  label: string;
  selected: boolean;
  hasBall: boolean;
  draggable?: boolean;
  onDrag: (actorId: string, svgX: number, svgY: number) => void;
  onSelect: (actorId: string) => void;
}

export function PlayerDot({
  actorId,
  cx,
  cy,
  color,
  label,
  selected,
  hasBall,
  draggable = true,
  onDrag,
  onSelect,
}: Props) {
  const dragging = useRef(false);

  const toSvgCoords = useCallback(
    (e: PointerEvent, svg: SVGSVGElement) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      return {
        x: (e.clientX - ctm.e) / ctm.a,
        y: (e.clientY - ctm.f) / ctm.d,
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      onSelect(actorId);
      if (!draggable) return;
      dragging.current = true;
      const g = e.currentTarget;
      g.setPointerCapture(e.pointerId);
    },
    [actorId, draggable, onSelect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!dragging.current) return;
      const svg = (e.currentTarget as SVGElement).ownerSVGElement;
      if (!svg) return;
      const pt = toSvgCoords(e.nativeEvent, svg);
      if (pt) onDrag(actorId, pt.x, pt.y);
    },
    [actorId, onDrag, toSvgCoords],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <g
      style={{ cursor: draggable ? "grab" : "pointer" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ball halo — yellow ring around the holder */}
      {hasBall && (
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="none"
          stroke="#ffab40"
          strokeWidth="1.2"
          opacity="0.85"
        />
      )}
      {/* Selection ring */}
      {selected && (
        <circle
          cx={cx}
          cy={cy}
          r={hasBall ? 8 : 6}
          fill="none"
          stroke="#fff"
          strokeWidth="0.6"
          strokeDasharray="1.5 1"
        />
      )}
      {/* Player circle */}
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#000" strokeWidth="0.4" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={3.2}
        fontWeight="bold"
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
