import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { TacticDocumentV1 } from "@volleyball/shared";
import { CourtSVG } from "./CourtSVG";
import { PlayerDot } from "./PlayerDot";
import {
  getActiveScreenEventIndex,
  playbackEndMs,
  resolveBallHolderAt,
  resolveScreenOverlaysAtT,
} from "./viewer-math";
import { MovementTrails } from "./MovementTrails";
import { PassLines } from "./PassLines";
import { FinishOptions } from "./FinishOptions";
import { EditorBench, type BenchFinishOption, type BenchPlayerOption, type EditorTool } from "./EditorBench";
import {
  getActiveFinishOptionsEventIndex,
  makeFinishOptionsEvent,
  normalizeFinishOptions,
  type FinishOption,
} from "./finish-options-data";
import { KeyframeTimeline } from "./KeyframeTimeline";
import { tacticToSvg, svgToTactic, type CourtMode } from "./court-geometry";

interface Props {
  document: TacticDocumentV1;
  onChange: (doc: TacticDocumentV1) => void;
  onOpenTemplates: () => void;
  courtMode: CourtMode;
  onCourtModeChange: (m: CourtMode) => void;
  onActiveTimeChange?: (tMs: number) => void;
  teamPlayers?: { id: string; name: string; number: number }[];
}

let _nextId = 1;
function genId() {
  return `p${Date.now().toString(36)}${_nextId++}`;
}

const DEFAULT_NEW_FRAME_GAP_MS = 1000;

type PlayerActor = Extract<TacticDocumentV1["actors"][number], { type: "player" }>;

function isPlayerActor(actor: TacticDocumentV1["actors"][number]): actor is PlayerActor {
  return actor.type === "player";
}

function nextAvailableNumber(existing: { number: number }[]): number {
  const used = new Set(existing.map((p) => p.number));
  return [1, 2, 3, 4, 5, 6].find((n) => !used.has(n)) ?? existing.length + 1;
}

function rosterPlayerLabel(player: { name: string; number: number }): string {
  const name = player.name.trim();
  return name || `${player.number}`;
}

function actorMatchesRosterPlayer(actor: PlayerActor, player: { id: string; name: string; number: number }): boolean {
  if (actor.rosterPlayerId === player.id) return true;
  const name = player.name.trim();
  return !actor.rosterPlayerId && !!name && actor.number === player.number && actor.label === name;
}

function hasReplaceablePlayerName(actor: PlayerActor): boolean {
  return !!actor.rosterPlayerId || actor.label.trim() !== `${actor.number}`;
}

function genericReplacementNumber(actor: PlayerActor, existing: PlayerActor[]): number {
  return nextAvailableNumber(existing.filter((p) => p.team === actor.team && p.id !== actor.id));
}

function remapEventsAtTime(
  events: TacticDocumentV1["events"],
  oldT: number,
  newT: number,
): TacticDocumentV1["events"] {
  if (!events?.length || oldT === newT) return events;
  return events.map((e) => (e.t === oldT ? { ...e, t: newT } : e));
}

function nearestTime(target: number, times: number[]): number {
  let best = times[0] ?? target;
  let bestDist = Math.abs(target - best);
  for (const t of times) {
    const d = Math.abs(target - t);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

function timelineDurationMs(doc: TacticDocumentV1): number {
  const lastKeyframeT = doc.keyframes.length ? Math.max(...doc.keyframes.map((k) => k.t)) : 0;
  return Math.max(doc.meta.durationMs ?? lastKeyframeT, lastKeyframeT);
}

const TIMELINE_SNAP_MS = 50;
const MIN_TIMELINE_DURATION_MS = 1000;
const MAX_TIMELINE_DURATION_MS = 60000;

/** 调节总时长时，按旧总时长比例缩放各关键帧与事件时间（与拖拽关键帧相同的 50ms 对齐）。 */
function scaleDocToNewDuration(doc: TacticDocumentV1, newDurationMs: number): TacticDocumentV1 {
  const clamped = Math.round(
    Math.max(MIN_TIMELINE_DURATION_MS, Math.min(MAX_TIMELINE_DURATION_MS, newDurationMs)),
  );
  const oldBase = Math.max(playbackEndMs(doc), 1);
  if (clamped === oldBase) {
    return { ...doc, meta: { ...doc.meta, durationMs: clamped } };
  }
  const ratio = clamped / oldBase;

  const indexed = doc.keyframes.map((k, origIdx) => ({ k, origIdx }));
  const sorted = [...indexed].sort((a, b) => a.k.t - b.k.t);
  const scaledTs: number[] = sorted.map(({ k }) => {
    const raw = k.t * ratio;
    return Math.round(Math.min(clamped, Math.max(0, raw)) / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS;
  });
  for (let j = 1; j < scaledTs.length; j++) {
    scaledTs[j] = Math.max(
      scaledTs[j - 1]! + TIMELINE_SNAP_MS,
      Math.min(scaledTs[j]!, clamped),
    );
  }
  if (scaledTs.length === 1) {
    scaledTs[0] = Math.min(scaledTs[0]!, clamped);
  }

  const newKeyframes = doc.keyframes.map((kf, i) => {
    const pos = sorted.findIndex((x) => x.origIdx === i);
    const newT = pos >= 0 ? scaledTs[pos]! : kf.t;
    return { ...kf, t: newT };
  });

  const evs = doc.events ?? [];
  const newEvents = evs.map((e) => {
    const raw = e.t * ratio;
    let nt = Math.round(Math.min(clamped, Math.max(0, raw)) / TIMELINE_SNAP_MS) * TIMELINE_SNAP_MS;
    nt = Math.max(0, Math.min(clamped, nt));
    return { ...e, t: nt };
  });

  return {
    ...doc,
    meta: { ...doc.meta, durationMs: clamped },
    keyframes: newKeyframes,
    events: newEvents,
  };
}

function evenlySpacedTime(index: number, count: number, durationMs: number): number {
  if (count <= 1) return 0;
  if (index === count - 1) return durationMs;
  return Math.round((durationMs * index) / (count - 1));
}

function redistributeKeyframeTimes(
  keyframes: TacticDocumentV1["keyframes"],
  durationMs: number,
): TacticDocumentV1["keyframes"] {
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  return sorted.map((k, i) => ({ ...k, t: evenlySpacedTime(i, sorted.length, durationMs) }));
}

function keyframesAreEvenlySpaced(
  keyframes: TacticDocumentV1["keyframes"],
  durationMs: number,
): boolean {
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  return sorted.every((k, i) => k.t === evenlySpacedTime(i, sorted.length, durationMs));
}

function remapEventsAtKeyframeTimes(
  events: TacticDocumentV1["events"],
  oldKeyframes: TacticDocumentV1["keyframes"],
  newKeyframes: TacticDocumentV1["keyframes"],
  extraTimeMap?: Map<number, number>,
): TacticDocumentV1["events"] {
  if (!events?.length) return events;
  const timeMap = new Map<number, number>();
  const count = Math.min(oldKeyframes.length, newKeyframes.length);
  for (let i = 0; i < count; i++) {
    timeMap.set(oldKeyframes[i].t, newKeyframes[i].t);
  }
  extraTimeMap?.forEach((newT, oldT) => timeMap.set(oldT, newT));
  return events.map((e) => {
    const newT = timeMap.get(e.t);
    return newT === undefined ? e : { ...e, t: newT };
  });
}

function manualNewKeyframeTime(
  sortedKeyframes: TacticDocumentV1["keyframes"],
  activeIndex: number,
  durationMs: number,
): { t: number; durationMs: number } | null {
  const current = sortedKeyframes[activeIndex] ?? sortedKeyframes[sortedKeyframes.length - 1];
  if (!current) return null;
  const next = sortedKeyframes.find((k) => k.t > current.t);
  if (next) {
    if (next.t - current.t <= 1) return null;
    return { t: Math.round((current.t + next.t) / 2), durationMs };
  }

  if (current.t < durationMs) return { t: durationMs, durationMs };

  const prev = sortedKeyframes[activeIndex - 1];
  const gap = prev && current.t > prev.t ? current.t - prev.t : DEFAULT_NEW_FRAME_GAP_MS;
  const t = current.t + gap;
  return { t, durationMs: t };
}

function clonePosesForNewKeyframe(
  poses: TacticDocumentV1["keyframes"][number]["poses"],
): TacticDocumentV1["keyframes"][number]["poses"] {
  return Object.fromEntries(
    Object.entries(poses).map(([id, pose]) => {
      const { cpx: _cpx, cpy: _cpy, ...poseWithoutCurve } = pose;
      return [id, poseWithoutCurve];
    }),
  );
}

function optionDisplayLabel(option: FinishOption) {
  if (option.label?.trim()) return option.label.trim();
  return option.kind === "shot" ? "Shot" : "Pass";
}

function finishOptionTargetLabel(option: FinishOption, actors: TacticDocumentV1["actors"]) {
  if (option.kind === "pass" && option.to) {
    const target = actors.find((actor) => actor.type === "player" && actor.id === option.to);
    return target?.type === "player" ? target.label : option.to;
  }
  if (option.x !== undefined && option.y !== undefined) {
    return `${Math.round(option.x * 100)}%, ${Math.round(option.y * 100)}%`;
  }
  return "";
}

function withFinishOptionUpdate(
  doc: TacticDocumentV1,
  eventIndex: number | null,
  fromId: string,
  t: number,
  updater: (options: FinishOption[]) => FinishOption[],
) {
  const events = [...(doc.events ?? [])];
  if (eventIndex === null) {
    events.push(makeFinishOptionsEvent(t, fromId, updater([])));
    return { ...doc, events };
  }

  const event = events[eventIndex];
  const nextOptions = updater(normalizeFinishOptions(event));
  if (nextOptions.length === 0) {
    events.splice(eventIndex, 1);
  } else {
    events[eventIndex] = {
      ...event,
      kind: "finish_options",
      from: event.from ?? fromId,
      options: nextOptions,
    };
  }
  return { ...doc, events };
}

export function TacticEditor({
  document: doc,
  onChange,
  onOpenTemplates,
  courtMode,
  onCourtModeChange,
  onActiveTimeChange,
  teamPlayers = [],
}: Props) {
  const [activeKfIdx, setActiveKfIdx] = useState(0);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [pendingPlayer, setPendingPlayer] = useState<BenchPlayerOption | null>(null);
  const [passSource, setPassSource] = useState<string | null>(null);
  const [draggingCp, setDraggingCp] = useState<{ actorId: string; kfIdx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const manuallyTimedKeyframes = useRef(false);

  const teamColors = {
    offense: doc.teams.offense.color ?? "#e53935",
    defense: doc.teams.defense.color ?? "#1e88e5",
  };

  const kf = doc.keyframes[activeKfIdx];
  const currentT = kf?.t ?? 0;

  const ballHolderId = useMemo(() => resolveBallHolderAt(doc, currentT), [doc, currentT]);
  const offensePlayers = doc.actors.filter((a): a is PlayerActor => isPlayerActor(a) && a.team === "offense");
  const defensePlayers = doc.actors.filter((a): a is PlayerActor => isPlayerActor(a) && a.team === "defense");
  const canAddOffense = offensePlayers.length < 6;
  const canAddDefense = defensePlayers.length < 6;
  const canReplaceOffenseName = offensePlayers.some(hasReplaceablePlayerName);
  const canReplaceDefenseName = defensePlayers.some(hasReplaceablePlayerName);
  const canUseOffenseTool = canAddOffense || canReplaceOffenseName;
  const canUseDefenseTool = canAddDefense || canReplaceDefenseName;
  const canUseRosterPlayers = canAddOffense || offensePlayers.length > 0;

  const availablePlayers = useMemo<BenchPlayerOption[]>(() => {
    return teamPlayers.map((p) => ({
      ...p,
      label: p.name.trim() ? `${p.number} ${p.name.trim()}` : `${p.number}`,
      disabled: offensePlayers.some((actor) => actorMatchesRosterPlayer(actor, p)),
    }));
  }, [teamPlayers, offensePlayers]);

  useEffect(() => {
    const pendingOption = pendingPlayer
      ? availablePlayers.find((p) => p.id === pendingPlayer.id)
      : undefined;
    if (pendingPlayer && (!pendingOption || pendingOption.disabled)) {
      setPendingPlayer(null);
    }
  }, [availablePlayers, pendingPlayer]);

  useEffect(() => {
    onActiveTimeChange?.(currentT);
  }, [currentT, onActiveTimeChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool("select");
      setPendingPlayer(null);
      setPassSource(null);
      setDraggingCp(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectedPlayer = selectedActorId
    ? doc.actors.find((a) => a.id === selectedActorId && a.type === "player")
    : null;
  const selectedPlayerData =
    selectedPlayer?.type === "player" ? selectedPlayer : null;

  useEffect(() => {
    if (tool === "finish" && !selectedPlayerData) setTool("select");
  }, [tool, selectedPlayerData]);

  const activeFinishEventIndex = useMemo(
    () => getActiveFinishOptionsEventIndex(doc.events, selectedActorId, currentT),
    [doc.events, selectedActorId, currentT],
  );

  const finishOptions = useMemo<BenchFinishOption[]>(() => {
    const event = activeFinishEventIndex === null ? undefined : doc.events?.[activeFinishEventIndex];
    return normalizeFinishOptions(event).map((option) => ({
      kind: option.kind,
      label: optionDisplayLabel(option),
      targetLabel: finishOptionTargetLabel(option, doc.actors),
      priority: option.priority,
    }));
  }, [activeFinishEventIndex, doc.events, doc.actors]);

  const handleToolChange = useCallback((t: EditorTool) => {
    if ((t === "addOffense" && !canUseOffenseTool) || (t === "addDefense" && !canUseDefenseTool)) return;
    if (t === "finish" && !selectedPlayerData) return;
    setTool(t);
    setPendingPlayer(null);
    setPassSource(null);
  }, [canUseOffenseTool, canUseDefenseTool, selectedPlayerData]);

  const handleRosterPlayerSelect = useCallback((player: BenchPlayerOption) => {
    if (!canUseRosterPlayers || player.disabled) return;
    setPendingPlayer(player);
    setTool("addOffense");
    setPassSource(null);
  }, [canUseRosterPlayers]);

  const handleDrag = useCallback(
    (actorId: string, svgX: number, svgY: number) => {
      const [tx, ty] = svgToTactic(svgX, svgY, courtMode);
      const newKfs = doc.keyframes.map((k, i) => {
        if (i !== activeKfIdx) return k;
        return { ...k, poses: { ...k.poses, [actorId]: { ...k.poses[actorId], x: tx, y: ty } } };
      });
      onChange({ ...doc, keyframes: newKfs });
    },
    [doc, activeKfIdx, onChange, courtMode],
  );

  const handleActorClick = useCallback(
    (actorId: string) => {
      if (tool === "addOffense" || tool === "addDefense") {
        const team: "offense" | "defense" = tool === "addOffense" ? "offense" : "defense";
        const target = doc.actors.find((a): a is PlayerActor => isPlayerActor(a) && a.id === actorId);
        if (!target || target.team !== team) {
          setSelectedActorId(actorId);
          return;
        }

        if (pendingPlayer) {
          if (team !== "offense") return;
          const newActors = doc.actors.map((a) => {
            if (a.id !== actorId || a.type !== "player") return a;
            return {
              ...a,
              rosterPlayerId: pendingPlayer.id,
              number: pendingPlayer.number,
              label: rosterPlayerLabel(pendingPlayer),
            };
          });
          onChange({ ...doc, actors: newActors });
          setSelectedActorId(actorId);
          setPendingPlayer(null);
          setPassSource(null);
          setTool("select");
          return;
        }

        if (!hasReplaceablePlayerName(target)) {
          setSelectedActorId(actorId);
          return;
        }
        const num = genericReplacementNumber(target, doc.actors.filter(isPlayerActor));
        const newActors = doc.actors.map((a) => {
          if (a.id !== actorId || a.type !== "player") return a;
          const nextActor = { ...a, number: num, label: `${num}` };
          delete nextActor.rosterPlayerId;
          return nextActor;
        });
        onChange({ ...doc, actors: newActors });
        setSelectedActorId(actorId);
        setPendingPlayer(null);
        setPassSource(null);
        setTool("select");
      } else if (tool === "pass") {
        if (!passSource) {
          if (ballHolderId && ballHolderId !== actorId) {
            setSelectedActorId(actorId);
            return;
          }
          setPassSource(actorId);
        } else if (passSource !== actorId) {
          const newEvent = { t: currentT, kind: "pass" as const, from: passSource, to: actorId };
          const events = [...(doc.events ?? []), newEvent];
          let newActors = doc.actors;
          if (!newActors.some((a) => a.type === "ball")) {
            newActors = [...newActors, { id: "ball", type: "ball" as const, heldBy: passSource }];
          }
          onChange({ ...doc, actors: newActors, events });
          setPassSource(null);
          setTool("select");
        }
      } else if (tool === "screen") {
        const newEvent = { t: currentT, kind: "screen" as const, from: actorId, angle: 0 };
        const events = [...(doc.events ?? []), newEvent];
        onChange({ ...doc, events });
        setTool("select");
      } else if (tool === "finish") {
        if (!selectedActorId || selectedActorId === actorId) {
          setSelectedActorId(actorId);
          return;
        }
        const target = doc.actors.find((a): a is PlayerActor => isPlayerActor(a) && a.id === actorId);
        if (!target || target.team !== "offense") return;
        const option: FinishOption = {
          kind: "pass",
          to: actorId,
          label: `传 ${target.label}`,
          priority: "counter",
        };
        onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, (options) => [
          ...options,
          option,
        ]));
      } else {
        setSelectedActorId(actorId);
      }
    },
    [tool, pendingPlayer, passSource, ballHolderId, currentT, doc, onChange, selectedActorId, activeFinishEventIndex],
  );

  const handleCourtClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (tool !== "addOffense" && tool !== "addDefense" && tool !== "finish") return;
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgX = (e.clientX - ctm.e) / ctm.a;
      const svgY = (e.clientY - ctm.f) / ctm.d;
      const [tx, ty] = svgToTactic(svgX, svgY, courtMode);

      if (tool === "finish") {
        if (!selectedActorId) return;
        const option: FinishOption = {
          kind: "shot",
          x: tx,
          y: ty,
          label: "落点",
          priority: "primary",
        };
        onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, (options) => [
          ...options,
          option,
        ]));
        return;
      }

      const team: "offense" | "defense" = tool === "addOffense" ? "offense" : "defense";
      const existing = doc.actors.filter((a): a is PlayerActor => isPlayerActor(a) && a.team === team);
      if (existing.length >= 6) return;
      const num = team === "offense" && pendingPlayer ? pendingPlayer.number : nextAvailableNumber(existing);
      const id = genId();
      const newActor: PlayerActor = {
        id,
        type: "player" as const,
        team,
        number: num,
        label: team === "offense" && pendingPlayer ? rosterPlayerLabel(pendingPlayer) : `${num}`,
      };
      if (team === "offense" && pendingPlayer) {
        newActor.rosterPlayerId = pendingPlayer.id;
      }
      const newKfs = doc.keyframes.map((k) => ({
        ...k,
        poses: { ...k.poses, [id]: { x: tx, y: ty } },
      }));
      onChange({
        ...doc,
        actors: [...doc.actors, newActor],
        keyframes: newKfs,
      });
      setSelectedActorId(id);
      setPendingPlayer(null);
      setTool("select");
    },
    [tool, doc, onChange, courtMode, pendingPlayer, selectedActorId, activeFinishEventIndex, currentT],
  );

  const handleRemoveSelected = useCallback(() => {
    if (!selectedActorId) return;
    const newActors = doc.actors.filter((a) => a.id !== selectedActorId);
    const newKfs = doc.keyframes.map((k) => {
      const { [selectedActorId]: _, ...rest } = k.poses;
      return { ...k, poses: rest };
    });
    const updatedActors = newActors.map((a) => {
      if (a.type === "ball" && a.heldBy === selectedActorId) {
        return { ...a, heldBy: undefined };
      }
      return a;
    });
    const updatedEvents = (doc.events ?? []).filter(
      (ev) => ev.from !== selectedActorId && ev.to !== selectedActorId,
    );
    onChange({ ...doc, actors: updatedActors, keyframes: newKfs, events: updatedEvents });
    setSelectedActorId(null);
  }, [selectedActorId, doc, onChange]);

  const handleActorUpdate = useCallback(
    (actorId: string, updates: { label?: string; number?: number }) => {
      const newActors = doc.actors.map((a) => {
        if (a.id !== actorId || a.type !== "player") return a;
        const nextActor = { ...a, ...updates };
        delete nextActor.rosterPlayerId;
        return nextActor;
      });
      onChange({ ...doc, actors: newActors });
    },
    [doc, onChange],
  );

  const handleToggleBall = useCallback(
    (actorId: string) => {
      const h = resolveBallHolderAt(doc, currentT);
      const events = [...(doc.events ?? [])];
      if (h === actorId) {
        events.push({ t: currentT, kind: "possess_end" as const });
      } else {
        events.push({ t: currentT, kind: "possess" as const, to: actorId });
      }
      let newActors = doc.actors;
      if (!newActors.some((a) => a.type === "ball")) {
        newActors = [...newActors, { id: "ball", type: "ball" as const }];
      }
      onChange({ ...doc, actors: newActors, events });
    },
    [doc, onChange, currentT],
  );

  const handleFinishOptionLabelChange = useCallback(
    (idx: number, label: string) => {
      if (!selectedActorId || activeFinishEventIndex === null) return;
      onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, (options) =>
        options.map((option, optionIdx) => (optionIdx === idx ? { ...option, label } : option)),
      ));
    },
    [selectedActorId, activeFinishEventIndex, doc, currentT, onChange],
  );

  const handleFinishOptionPriorityChange = useCallback(
    (idx: number, priority: string) => {
      if (!selectedActorId || activeFinishEventIndex === null) return;
      onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, (options) =>
        options.map((option, optionIdx) => (optionIdx === idx ? { ...option, priority } : option)),
      ));
    },
    [selectedActorId, activeFinishEventIndex, doc, currentT, onChange],
  );

  const handleRemoveFinishOption = useCallback(
    (idx: number) => {
      if (!selectedActorId || activeFinishEventIndex === null) return;
      onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, (options) =>
        options.filter((_, optionIdx) => optionIdx !== idx),
      ));
    },
    [selectedActorId, activeFinishEventIndex, doc, currentT, onChange],
  );

  const handleClearFinishOptions = useCallback(() => {
    if (!selectedActorId || activeFinishEventIndex === null) return;
    onChange(withFinishOptionUpdate(doc, activeFinishEventIndex, selectedActorId, currentT, () => []));
    if (tool === "finish") setTool("select");
  }, [selectedActorId, activeFinishEventIndex, doc, currentT, onChange, tool]);

  const handleClearSelectedFrameAction = useCallback(() => {
    if (!selectedActorId || activeKfIdx <= 0) return;
    const prevKf = doc.keyframes[activeKfIdx - 1];
    const currentKf = doc.keyframes[activeKfIdx];
    const prevPose = prevKf?.poses[selectedActorId];
    if (!prevKf || !currentKf || !prevPose) return;

    const previousHolder = resolveBallHolderAt(doc, Math.max(0, currentT - 1));
    const cleanedEvents = (doc.events ?? []).filter((e) => {
      if (e.t !== currentT) return true;
      if (e.from === selectedActorId || e.to === selectedActorId) return false;
      if (e.kind === "possess_end" && previousHolder === selectedActorId) return false;
      return true;
    });
    const { cpx: _cpx, cpy: _cpy, ...poseWithoutCurve } = prevPose;
    const keyframes = doc.keyframes.map((kfItem, i) => {
      if (i !== activeKfIdx) return kfItem;
      return {
        ...kfItem,
        poses: {
          ...kfItem.poses,
          [selectedActorId]: poseWithoutCurve,
        },
      };
    });

    onChange({ ...doc, keyframes, events: cleanedEvents });
    setPassSource(null);
    setTool("select");
  }, [selectedActorId, activeKfIdx, doc, currentT, onChange]);

  const handleAddKeyframe = useCallback(() => {
    const duration = timelineDurationMs(doc);
    const sorted = [...doc.keyframes].sort((a, b) => a.t - b.t);
    if (!manuallyTimedKeyframes.current && keyframesAreEvenlySpaced(sorted, duration)) {
      const last = sorted[sorted.length - 1];
      const newKf = { t: duration, poses: last ? clonePosesForNewKeyframe(last.poses) : {} };
      const newKfs = redistributeKeyframeTimes([...sorted, newKf], duration);
      const existingNewKfs = newKfs.slice(0, sorted.length);
      onChange({
        ...doc,
        meta: { ...doc.meta, durationMs: duration },
        keyframes: newKfs,
        events: remapEventsAtKeyframeTimes(doc.events, sorted, existingNewKfs),
      });
      setActiveKfIdx(newKfs.length - 1);
      return;
    }

    const target = manualNewKeyframeTime(sorted, activeKfIdx, duration);
    if (!target) return;
    const current = sorted[activeKfIdx] ?? sorted[sorted.length - 1];
    const newKf = { t: target.t, poses: current ? clonePosesForNewKeyframe(current.poses) : {} };
    const newKfs = [...sorted, newKf].sort((a, b) => a.t - b.t);
    onChange({
      ...doc,
      meta: { ...doc.meta, durationMs: target.durationMs },
      keyframes: newKfs,
    });
    setActiveKfIdx(newKfs.findIndex((k) => k === newKf));
  }, [doc, activeKfIdx, onChange]);

  const handleRemoveKeyframe = useCallback(
    (docIdx: number) => {
      if (doc.keyframes.length <= 1) return;
      const removed = doc.keyframes[docIdx];
      if (!removed) return;
      const duration = timelineDurationMs(doc);
      const sortedBefore = [...doc.keyframes].sort((a, b) => a.t - b.t);
      const sortedIdx = sortedBefore.indexOf(removed);
      if (sortedIdx < 0) return;
      const keptBefore = sortedBefore.filter((_, i) => i !== sortedIdx);
      const shouldRedistribute =
        !manuallyTimedKeyframes.current && keyframesAreEvenlySpaced(sortedBefore, duration);
      const newKfs = shouldRedistribute
        ? redistributeKeyframeTimes(keptBefore, duration)
        : keptBefore;
      const removedEventTimeMap = new Map<number, number>();
      if (removed) {
        const keptTimes = keptBefore.map((k) => k.t);
        const nearestKeptT = nearestTime(removed.t, keptTimes);
        const nearestKeptIndex = shouldRedistribute
          ? keptBefore.findIndex((k) => k.t === nearestKeptT)
          : -1;
        const fallbackT = nearestKeptIndex >= 0
          ? (newKfs[nearestKeptIndex]?.t ?? nearestKeptT)
          : nearestKeptT;
        removedEventTimeMap.set(removed.t, fallbackT);
      }
      const newEvents = shouldRedistribute
        ? remapEventsAtKeyframeTimes(doc.events, keptBefore, newKfs, removedEventTimeMap)
        : remapEventsAtKeyframeTimes(doc.events, [], [], removedEventTimeMap);
      onChange({ ...doc, meta: { ...doc.meta, durationMs: duration }, keyframes: newKfs, events: newEvents });
      const prevActiveKf = doc.keyframes[activeKfIdx];
      if (docIdx === activeKfIdx) {
        setActiveKfIdx(Math.min(docIdx, newKfs.length - 1));
      } else {
        const nextIdx = newKfs.findIndex((k) => k === prevActiveKf);
        setActiveKfIdx(nextIdx >= 0 ? nextIdx : 0);
      }
    },
    [doc, activeKfIdx, onChange],
  );

  const handleMoveKeyframe = useCallback(
    (idx: number, newT: number) => {
      manuallyTimedKeyframes.current = true;
      const dur = playbackEndMs(doc);
      const snapped = Math.round(Math.max(0, Math.min(newT, dur)) / 50) * 50;
      if (doc.keyframes.some((k, i) => i !== idx && k.t === snapped)) return;
      const oldT = doc.keyframes[idx].t;
      const newKfs = doc.keyframes
        .map((k, i) => (i === idx ? { ...k, t: snapped } : k));
      const newEvents = remapEventsAtTime(doc.events, oldT, snapped);
      onChange({ ...doc, keyframes: newKfs, events: newEvents });
      setActiveKfIdx(idx);
    },
    [doc, onChange],
  );

  const handleCommitKeyframeMove = useCallback(
    (idx: number) => {
      const movedT = doc.keyframes[idx]?.t;
      if (movedT === undefined) return;
      const newKfs = [...doc.keyframes].sort((a, b) => a.t - b.t);
      onChange({ ...doc, keyframes: newKfs });
      setActiveKfIdx(newKfs.findIndex((k) => k.t === movedT));
    },
    [doc, onChange],
  );

  const handleRedistributeKeyframes = useCallback(() => {
    if (doc.keyframes.length <= 1) return;
    const duration = timelineDurationMs(doc);
    const sorted = [...doc.keyframes].sort((a, b) => a.t - b.t);
    const activeKf = doc.keyframes[activeKfIdx];
    const activeSortedIdx = activeKf ? sorted.indexOf(activeKf) : activeKfIdx;
    const newKfs = redistributeKeyframeTimes(sorted, duration);

    manuallyTimedKeyframes.current = false;
    onChange({
      ...doc,
      meta: { ...doc.meta, durationMs: duration },
      keyframes: newKfs,
      events: remapEventsAtKeyframeTimes(doc.events, sorted, newKfs),
    });
    setActiveKfIdx(Math.max(0, Math.min(activeSortedIdx, newKfs.length - 1)));
  }, [doc, activeKfIdx, onChange]);

  const handleScreenAngleChange = useCallback(
    (angle: number) => {
      if (!selectedActorId) return;
      const evs = doc.events ?? [];
      const idx = getActiveScreenEventIndex(evs, selectedActorId, currentT);
      if (idx === null) return;
      const events = evs.map((e, i) => (i === idx ? { ...e, angle } : e));
      onChange({ ...doc, events });
    },
    [selectedActorId, doc, onChange, currentT],
  );

  const handleRemoveScreen = useCallback(() => {
    if (!selectedActorId) return;
    const evs = doc.events ?? [];
    const idx = getActiveScreenEventIndex(evs, selectedActorId, currentT);
    if (idx === null) return;
    const e = evs[idx];
    if (e.kind === "screen" && e.t === currentT) {
      onChange({ ...doc, events: evs.filter((_, i) => i !== idx) });
    } else {
      const startT = e.kind === "screen" ? e.t : currentT;
      const endT = Math.max(startT, Math.round((startT + currentT) / 2));
      onChange({
        ...doc,
        events: [...evs, { t: endT, kind: "screen_end" as const, from: selectedActorId }],
      });
    }
  }, [selectedActorId, doc, onChange, currentT]);

  const handleDurationChange = useCallback(
    (ms: number) => {
      onChange(scaleDocToNewDuration(doc, ms));
    },
    [doc, onChange],
  );

  // --- Control point drag ---
  const handleCpPointerDown = useCallback(
    (actorId: string, kfIdx: number, e: React.PointerEvent) => {
      e.stopPropagation();
      setDraggingCp({ actorId, kfIdx });
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleCpPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingCp) return;
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgX = (e.clientX - ctm.e) / ctm.a;
      const svgY = (e.clientY - ctm.f) / ctm.d;
      const [tx, ty] = svgToTactic(svgX, svgY, courtMode);
      const { actorId, kfIdx } = draggingCp;
      const newKfs = doc.keyframes.map((k, i) => {
        if (i !== kfIdx) return k;
        const pose = k.poses[actorId];
        if (!pose) return k;
        return { ...k, poses: { ...k.poses, [actorId]: { ...pose, cpx: tx, cpy: ty } } };
      });
      onChange({ ...doc, keyframes: newKfs });
    },
    [draggingCp, doc, onChange, courtMode],
  );

  const handleCpPointerUp = useCallback(() => {
    setDraggingCp(null);
  }, []);

  const screenMap = resolveScreenOverlaysAtT(doc, currentT);

  const courtCursor =
    tool === "addOffense" || tool === "addDefense"
      ? "crosshair"
      : tool === "pass" || tool === "screen" || tool === "finish"
        ? "pointer"
        : undefined;

  // Build control point handles for selected actor
  const cpHandles: React.ReactNode[] = [];
  if (selectedActorId) {
    const maxI = Math.min(activeKfIdx, doc.keyframes.length - 1);
    for (let i = 1; i <= maxI; i++) {
      const prevPose = doc.keyframes[i - 1].poses[selectedActorId];
      const currPose = doc.keyframes[i].poses[selectedActorId];
      if (!prevPose || !currPose) continue;

      const [x0, y0] = tacticToSvg(prevPose.x, prevPose.y, courtMode);
      const [x1, y1] = tacticToSvg(currPose.x, currPose.y, courtMode);
      if (Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) < 0.5) continue;

      const hasCp = currPose.cpx !== undefined && currPose.cpy !== undefined;
      const cpx = hasCp ? currPose.cpx! : (prevPose.x + currPose.x) / 2;
      const cpy = hasCp ? currPose.cpy! : (prevPose.y + currPose.y) / 2;
      const [hx, hy] = tacticToSvg(cpx, cpy, courtMode);

      cpHandles.push(
        <g key={`cp-${selectedActorId}-${i}`}>
          {/* Dashed line to endpoints */}
          <line x1={x0} y1={y0} x2={hx} y2={hy} stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" strokeDasharray="1.5 1" />
          <line x1={hx} y1={hy} x2={x1} y2={y1} stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" strokeDasharray="1.5 1" />
          {/* Draggable diamond */}
          <rect
            x={hx - 2.5}
            y={hy - 2.5}
            width={5}
            height={5}
            rx={1}
            fill={hasCp ? "rgba(255,200,60,0.8)" : "rgba(255,255,255,0.3)"}
            stroke="#fff"
            strokeWidth="0.4"
            style={{ cursor: "grab" }}
            transform={`rotate(45,${hx},${hy})`}
            onPointerDown={(e) => handleCpPointerDown(selectedActorId!, i, e)}
            onPointerMove={handleCpPointerMove}
            onPointerUp={handleCpPointerUp}
          />
        </g>,
      );
    }
  }

  return (
    <div className="tactic-editor">
      <EditorBench
        side="left"
        tool={tool}
        onToolChange={handleToolChange}
        courtMode={courtMode}
        onCourtModeChange={onCourtModeChange}
        doc={doc}
        selectedActor={selectedPlayerData}
        ballHolderId={ballHolderId}
        passSource={passSource}
        screenAngle={selectedActorId ? screenMap.get(selectedActorId) : undefined}
        finishOptions={finishOptions}
        onActorUpdate={handleActorUpdate}
        onToggleBall={handleToggleBall}
        onRemoveActor={handleRemoveSelected}
        onOpenTemplates={onOpenTemplates}
        onClearFrameAction={handleClearSelectedFrameAction}
        canClearFrameAction={!!selectedPlayerData && activeKfIdx > 0}
        onScreenAngleChange={handleScreenAngleChange}
        onRemoveScreen={handleRemoveScreen}
        onFinishOptionLabelChange={handleFinishOptionLabelChange}
        onFinishOptionPriorityChange={handleFinishOptionPriorityChange}
        onRemoveFinishOption={handleRemoveFinishOption}
        onClearFinishOptions={handleClearFinishOptions}
        availablePlayers={availablePlayers}
        pendingPlayer={pendingPlayer}
        onRosterPlayerSelect={handleRosterPlayerSelect}
        canUseOffenseTool={canUseOffenseTool}
        canUseDefenseTool={canUseDefenseTool}
        canUseRosterPlayers={canUseRosterPlayers}
      />

      <div className="editor-court">
        <CourtSVG
          ref={svgRef}
          mode={courtMode}
          className={`court-svg court-svg--editor${courtCursor ? ` court-svg--${courtCursor}` : ""}`}
          onClick={handleCourtClick}
        >
          <MovementTrails
            document={doc}
            teamColors={teamColors}
            courtMode={courtMode}
            upToKeyframeIndex={activeKfIdx}
          />
          <PassLines document={doc} courtMode={courtMode} visibleUpToTimeMs={currentT} />

          {/* Control point handles */}
          {cpHandles}

          {doc.actors.map((a) => {
            if (a.type === "ball") {
              if (ballHolderId) return null;
              const p = kf?.poses[a.id] ?? { x: 0.5, y: 0.5 };
              const [sx, sy] = tacticToSvg(p.x, p.y, courtMode);
              return (
                <circle
                  key={a.id}
                  cx={sx}
                  cy={sy}
                  r={2.2}
                  fill="#ffab40"
                  stroke="#3d2200"
                  strokeWidth="0.4"
                />
              );
            }
            const p = kf?.poses[a.id];
            if (!p) return null;
            const [sx, sy] = tacticToSvg(p.x, p.y, courtMode);
            const color = teamColors[a.team] ?? teamColors.offense;
            const isPassSrc = passSource === a.id;
            return (
              <g key={a.id}>
                <PlayerDot
                  actorId={a.id}
                  cx={sx}
                  cy={sy}
                  color={isPassSrc ? "#4caf50" : color}
                  label={a.label}
                  selected={a.id === selectedActorId}
                  hasBall={a.id === ballHolderId}
                  draggable={tool === "select"}
                  onDrag={handleDrag}
                  onSelect={handleActorClick}
                />
              </g>
            );
          })}
          {/* Screen T-markers above all players so they are never occluded */}
          <g style={{ pointerEvents: "none" }}>
            {doc.actors.map((a) => {
              if (a.type !== "player") return null;
              const p = kf?.poses[a.id];
              if (!p) return null;
              const screenAngle = screenMap.get(a.id);
              if (screenAngle === undefined) return null;
              const [sx, sy] = tacticToSvg(p.x, p.y, courtMode);
              return (
                <g key={`screen-${a.id}`} transform={`translate(${sx}, ${sy}) rotate(${screenAngle})`}>
                  <line x1={-3.5} y1={-9} x2={3.5} y2={-9} stroke="#ffeb3b" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1={0} y1={-9} x2={0} y2={-5} stroke="#ffeb3b" strokeWidth="1.2" strokeLinecap="round" />
                </g>
              );
            })}
          </g>
          <FinishOptions document={doc} courtMode={courtMode} visibleAtTimeMs={currentT} />
        </CourtSVG>
      </div>

      <EditorBench
        side="right"
        tool={tool}
        onToolChange={handleToolChange}
        courtMode={courtMode}
        onCourtModeChange={onCourtModeChange}
        doc={doc}
        selectedActor={selectedPlayerData}
        ballHolderId={ballHolderId}
        passSource={passSource}
        screenAngle={selectedActorId ? screenMap.get(selectedActorId) : undefined}
        finishOptions={finishOptions}
        onActorUpdate={handleActorUpdate}
        onToggleBall={handleToggleBall}
        onRemoveActor={handleRemoveSelected}
        onOpenTemplates={onOpenTemplates}
        onClearFrameAction={handleClearSelectedFrameAction}
        canClearFrameAction={!!selectedPlayerData && activeKfIdx > 0}
        onScreenAngleChange={handleScreenAngleChange}
        onRemoveScreen={handleRemoveScreen}
        onFinishOptionLabelChange={handleFinishOptionLabelChange}
        onFinishOptionPriorityChange={handleFinishOptionPriorityChange}
        onRemoveFinishOption={handleRemoveFinishOption}
        onClearFinishOptions={handleClearFinishOptions}
        availablePlayers={availablePlayers}
        pendingPlayer={pendingPlayer}
        onRosterPlayerSelect={handleRosterPlayerSelect}
        canUseOffenseTool={canUseOffenseTool}
        canUseDefenseTool={canUseDefenseTool}
        canUseRosterPlayers={canUseRosterPlayers}
      />

      <div className="editor-timeline">
        <KeyframeTimeline
          keyframes={doc.keyframes}
          activeIndex={activeKfIdx}
          durationMs={Math.max(playbackEndMs(doc), MIN_TIMELINE_DURATION_MS)}
          currentT={currentT}
          onSelect={setActiveKfIdx}
          onAdd={handleAddKeyframe}
          onRemove={handleRemoveKeyframe}
          onMove={handleMoveKeyframe}
          onMoveEnd={handleCommitKeyframeMove}
          onRedistribute={handleRedistributeKeyframes}
          onDurationChange={handleDurationChange}
        />
      </div>
    </div>
  );
}
