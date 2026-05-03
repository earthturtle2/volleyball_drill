import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TacticDocumentV1 } from "@volleyball/shared";
import { PlayPreview } from "./PlayPreview";
import { courtModeFromDocument } from "./court-geometry";
import { playbackEndMs } from "./viewer-math";
import { useT } from "../i18n";

type Props = {
  document: TacticDocumentV1;
  /** When this value changes, time and playback state reset (e.g. play id or share token). */
  resetPlaybackKey?: string | number;
  rangeInputId?: string;
};

export function PlaybackPreviewSection({ document: doc, resetPlaybackKey, rangeInputId = "playback-range" }: Props) {
  const { t } = useT();
  const [tMs, setTms] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frameByFrame, setFrameByFrame] = useState(false);
  const [frameStepTarget, setFrameStepTarget] = useState<{ from: number; to: number } | null>(null);
  const [loop, setLoop] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const tMsRef = useRef(0);
  tMsRef.current = tMs;
  const speedRef = useRef(playbackSpeed);
  speedRef.current = playbackSpeed;
  const frameStepTargetRef = useRef(frameStepTarget);
  frameStepTargetRef.current = frameStepTarget;

  useEffect(() => {
    setTms(0);
    setPlaying(false);
    setFrameByFrame(false);
    setFrameStepTarget(null);
    setLoop(false);
  }, [resetPlaybackKey]);

  const effectiveEnd = playbackEndMs(doc);

  const startFrameStep = useCallback(() => {
    if (frameStepTargetRef.current) return;
    const endT = playbackEndMs(doc);
    const stops = [...new Set(doc.keyframes.map((k) => k.t))].sort((a, b) => a - b);
    if (endT > (stops[stops.length - 1] ?? 0)) stops.push(endT);
    if (stops.length === 0) return;
    const E = 0.5;
    const from = tMsRef.current;
    const nextT = stops.find((tm) => tm > from + E);
    if (nextT !== undefined) {
      if (Math.abs(nextT - from) < 0.25) return;
      setFrameStepTarget({ from, to: nextT });
      return;
    }
    if (stops.length < 2) {
      setTms(stops[0]!);
      return;
    }
    const t0 = stops[0]!;
    const t1 = stops[1]!;
    if (Math.abs(t1 - t0) < 0.25) {
      setTms(t0);
      return;
    }
    setTms(t0);
    setFrameStepTarget({ from: t0, to: t1 });
  }, [doc]);

  const startRef = useRef(0);
  useEffect(() => {
    if (frameByFrame) setPlaying(false);
  }, [frameByFrame]);

  useEffect(() => {
    if (!frameByFrame) setFrameStepTarget(null);
  }, [frameByFrame]);

  useEffect(() => {
    if (!frameStepTarget) return;
    const { from, to } = frameStepTarget;
    if (from === to) {
      setFrameStepTarget(null);
      return;
    }
    const total = Math.abs(to - from);
    const dir = to >= from ? 1 : -1;
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const dt = (now - t0) * speedRef.current;
      if (dt >= total) {
        setTms(to);
        setFrameStepTarget(null);
        return;
      }
      setTms(from + dir * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameStepTarget]);

  useEffect(() => {
    if (!playing || frameByFrame) return;
    const endT = playbackEndMs(doc);
    const speed = playbackSpeed;
    startRef.current = performance.now() - tMsRef.current / speed;
    let raf: number;
    const tick = (now: number) => {
      const raw = (now - startRef.current) * speed;
      if (loop) {
        setTms(raw % (endT || 1));
      } else {
        if (raw >= endT) {
          setTms(endT);
          setPlaying(false);
          return;
        }
        setTms(raw);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, playing, loop, playbackSpeed, frameByFrame]);

  const previewStopTimes = useMemo(() => {
    const endT = playbackEndMs(doc);
    return [...new Set([0, ...doc.keyframes.map((k) => k.t), endT])]
      .filter((tm) => tm >= 0 && tm <= endT)
      .sort((a, b) => a - b);
  }, [doc]);

  const progressPct = effectiveEnd > 0 ? Math.max(0, Math.min(100, (tMs / effectiveEnd) * 100)) : 0;
  const currentStopIdx = previewStopTimes.findIndex((tm) => Math.abs(tm - tMs) < 1);
  const previousStop =
    [...previewStopTimes].reverse().find((tm) => tm < tMs - 1) ?? previewStopTimes[0];
  const nextStop = previewStopTimes.find((tm) => tm > tMs + 1) ?? previewStopTimes[previewStopTimes.length - 1];
  const seekPreview = (nextT: number) => {
    setPlaying(false);
    setFrameStepTarget(null);
    setTms(nextT);
  };

  const courtMode = courtModeFromDocument(doc);

  return (
    <>
      <PlayPreview document={doc} tMs={tMs} courtMode={courtMode} />
      <div className="preview-controls view-controls">
        <div className="preview-controls__timeline-row">
          <span className="preview-controls__time">
            {Math.round(tMs)} / {effectiveEnd} ms
          </span>
          <div className="preview-controls__timeline">
            <div className="preview-controls__track">
              <div className="preview-controls__progress" style={{ width: `${progressPct}%` }} />
              {previewStopTimes.map((tm, i) => {
                const left = effectiveEnd > 0 ? (tm / effectiveEnd) * 100 : 0;
                const active = currentStopIdx === i;
                return (
                  <button
                    key={`${tm}-${i}`}
                    type="button"
                    className={`preview-controls__mark${active ? " preview-controls__mark--active" : ""}`}
                    style={{ left: `${left}%` }}
                    onClick={() => seekPreview(tm)}
                    title={`${t("kf.frame")} ${i + 1}: ${tm}ms`}
                  />
                );
              })}
            </div>
            <input
              id={rangeInputId}
              className="preview-controls__range"
              type="range"
              min={0}
              max={effectiveEnd}
              value={tMs}
              onChange={(e) => seekPreview(Number(e.target.value))}
              aria-label={t("view.time")}
            />
          </div>
        </div>

        <div className="preview-controls__actions view-controls__actions">
          <div className="view-controls__transport">
            <button
              type="button"
              className="btn btn-sm"
              disabled={previousStop === undefined || tMs <= (previewStopTimes[0] ?? 0)}
              onClick={() => previousStop !== undefined && seekPreview(previousStop)}
              title={t("edit.prevFrame")}
            >
              {t("edit.prevFrame")}
            </button>
            <button
              type="button"
              className="btn btn-primary preview-controls__play"
              disabled={!!(frameByFrame && frameStepTarget !== null)}
              onClick={() => {
                if (frameByFrame) {
                  void startFrameStep();
                  return;
                }
                if (playing) {
                  setPlaying(false);
                } else {
                  if (tMs >= effectiveEnd) setTms(0);
                  setPlaying(true);
                }
              }}
            >
              {frameByFrame ? t("view.play") : playing ? t("view.pause") : t("view.play")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={nextStop === undefined || tMs >= (previewStopTimes[previewStopTimes.length - 1] ?? effectiveEnd)}
              onClick={() => nextStop !== undefined && seekPreview(nextStop)}
              title={t("edit.nextFrame")}
            >
              {t("edit.nextFrame")}
            </button>
          </div>

          <div className="view-controls__options">
            <label className="preview-controls__toggle">
              <input
                type="checkbox"
                checked={frameByFrame}
                onChange={(e) => setFrameByFrame(e.target.checked)}
              />
              <span>{t("view.frameByFrame")}</span>
            </label>
            <label className="preview-controls__toggle">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                disabled={frameByFrame}
              />
              <span>{t("edit.loop")}</span>
            </label>
          </div>

          <span className="preview-controls__speed view-controls__speed">
            <span>{t("view.speed")}</span>
            {([0.5, 1, 2] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`btn btn-sm ${playbackSpeed === s ? "btn-active" : ""}`}
                onClick={() => setPlaybackSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </span>
        </div>
      </div>
    </>
  );
}
