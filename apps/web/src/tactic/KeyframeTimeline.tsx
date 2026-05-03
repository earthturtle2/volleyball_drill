import { useCallback, useRef } from "react";
import { useT } from "../i18n";

interface Keyframe {
  t: number;
  poses: Record<string, { x: number; y: number }>;
}

interface Props {
  keyframes: Keyframe[];
  activeIndex: number;
  durationMs: number;
  currentT: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, t: number) => void;
  onMoveEnd?: (idx: number) => void;
  onRedistribute: () => void;
  onDurationChange: (ms: number) => void;
}

export function KeyframeTimeline({
  keyframes,
  activeIndex,
  durationMs,
  currentT,
  onSelect,
  onAdd,
  onRemove,
  onMove,
  onMoveEnd,
  onRedistribute,
  onDurationChange,
}: Props) {
  const { t } = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingIdx = useRef<number | null>(null);

  const handleAdd = useCallback(() => {
    onAdd();
  }, [onAdd]);

  const pctFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [],
  );

  const handleMarkerPointerDown = useCallback(
    (idx: number, e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      draggingIdx.current = idx;
      onSelect(idx);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onSelect],
  );

  const handleMarkerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (draggingIdx.current === null) return;
      const pct = pctFromEvent(e.clientX);
      const newT = Math.round(pct * durationMs);
      onMove(draggingIdx.current, newT);
    },
    [durationMs, onMove, pctFromEvent],
  );

  const handleMarkerPointerUp = useCallback(() => {
    if (draggingIdx.current !== null) onMoveEnd?.(draggingIdx.current);
    draggingIdx.current = null;
  }, [onMoveEnd]);

  const pct = (tv: number) => `${(tv / Math.max(durationMs, 1)) * 100}%`;

  return (
    <div className="kf-timeline">
      <div className="kf-timeline__bar">
        <div className="kf-timeline__track" ref={trackRef}>
          <div className="kf-timeline__playhead" style={{ left: pct(currentT) }} />

          {keyframes.map((kf, i) => (
            <button
              key={i}
              type="button"
              className={`kf-timeline__marker ${i === activeIndex ? "kf-timeline__marker--active" : ""}`}
              style={{ left: pct(kf.t), touchAction: "none" }}
              title={`${t("kf.frame")} ${i + 1}: ${kf.t}ms — ${t("kf.dragHint")}`}
              onPointerDown={(e) => handleMarkerPointerDown(i, e)}
              onPointerMove={handleMarkerPointerMove}
              onPointerUp={handleMarkerPointerUp}
              onPointerCancel={handleMarkerPointerUp}
            >
              <span className="kf-timeline__marker-label">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="kf-timeline__controls">
        <button type="button" className="btn btn-sm" onClick={handleAdd} title={t("kf.addTitle")}>
          {t("kf.addFrame")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={keyframes.length <= 1}
          onClick={() => onRemove(activeIndex)}
          title={t("kf.removeTitle")}
        >
          {t("kf.removeFrame")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={keyframes.length <= 1}
          onClick={onRedistribute}
          title={t("kf.redistributeTitle")}
        >
          {t("kf.redistribute")}
        </button>
        <label className="kf-timeline__duration">
          {t("kf.duration")}
          <input
            type="number"
            min={1000}
            max={60000}
            step={500}
            value={durationMs}
            onChange={(e) => onDurationChange(Number(e.target.value) || 8000)}
          />
          ms
        </label>
        <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {t("kf.frame")} {activeIndex + 1}/{keyframes.length} @ {currentT}ms
        </span>
      </div>
    </div>
  );
}
