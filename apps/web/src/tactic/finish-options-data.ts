import type { TacticDocumentV1 } from "@volleyball/shared";

export type FinishOptionKind = "shot" | "pass" | "tip" | "cover";

export type FinishOption = {
  kind: FinishOptionKind;
  label?: string;
  to?: string;
  x?: number;
  y?: number;
  priority?: string;
};

export type FinishOptionsEvent = {
  t: number;
  from?: string;
  note?: string;
  options: FinishOption[];
};

type EventRow = NonNullable<TacticDocumentV1["events"]>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseFinishOption(value: unknown): FinishOption | null {
  if (!isRecord(value)) return null;
  const rawKind = value.kind;
  const kind: FinishOptionKind | null =
    rawKind === "shot" || rawKind === "pass" || rawKind === "tip" || rawKind === "cover" ? rawKind : null;
  if (!kind) return null;

  const option: FinishOption = {
    kind,
    label: stringValue(value.label),
    to: stringValue(value.to),
    x: clampOptionCoord(finiteNumber(value.x)),
    y: clampOptionCoord(finiteNumber(value.y)),
    priority: stringValue(value.priority),
  };

  if (option.to || (option.x !== undefined && option.y !== undefined)) return option;
  return null;
}

function clampOptionCoord(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(1, value));
}

function eventAction(event: EventRow): string {
  const raw = event as { action?: unknown; subtype?: unknown; note?: unknown };
  const parts = [event.kind, raw.action, raw.subtype, raw.note]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
  return parts;
}

function isBallProgressionEvent(event: EventRow): boolean {
  if (event.kind === "pass" && event.from && event.to) return true;
  if (event.kind !== "ball_action") return false;
  const action = eventAction(event);
  return /\b(serve|receive|first_pass|set|attack|tip|dig|cover|free_ball)\b/.test(action);
}

function isRelatedBallProgression(event: EventRow, fromId: string | undefined): boolean {
  if (!isBallProgressionEvent(event)) return false;
  if (!fromId) return true;
  return event.from === fromId || event.to === fromId;
}

function isRelatedFinishOptionsEvent(candidate: EventRow, event: EventRow): boolean {
  if (candidate.kind !== "finish_options") return false;
  if (!event.from) return true;
  if (!candidate.from) return true;
  return candidate.from === event.from;
}

function finishOptionsExpiresAt(events: TacticDocumentV1["events"], eventIndex: number): number {
  const event = events?.[eventIndex];
  if (!events?.length || !event) return Number.POSITIVE_INFINITY;
  let expiresAt = Number.POSITIVE_INFINITY;
  for (let i = 0; i < events.length; i++) {
    if (i === eventIndex) continue;
    const candidate = events[i]!;
    if (candidate.t < event.t) continue;
    if (candidate.t === event.t && i <= eventIndex) continue;
    if (isRelatedFinishOptionsEvent(candidate, event) || isRelatedBallProgression(candidate, event.from)) {
      expiresAt = Math.min(expiresAt, candidate.t);
    }
  }
  return expiresAt;
}

export function getActiveFinishOptionsEvent(
  events: TacticDocumentV1["events"],
  tMs: number,
  fromId?: string | null,
): { event: FinishOptionsEvent; index: number } | null {
  if (!events?.length) return null;
  const active = events
    .map((raw, index) => ({ parsed: parseFinishOptionsEvent(raw), index }))
    .filter((item): item is { parsed: FinishOptionsEvent; index: number } => Boolean(item.parsed))
    .filter(({ parsed }) => (!fromId || parsed.from === fromId) && parsed.t <= tMs)
    .filter(({ index }) => tMs < finishOptionsExpiresAt(events, index))
    .sort((a, b) => a.parsed.t - b.parsed.t || a.index - b.index);
  const latest = active.at(-1);
  return latest ? { event: latest.parsed, index: latest.index } : null;
}

export function getActiveFinishOptionsEvents(
  events: TacticDocumentV1["events"],
  tMs: number,
): Array<{ event: FinishOptionsEvent; index: number }> {
  if (!events?.length) return [];
  const latestByAttacker = new Map<string, { event: FinishOptionsEvent; index: number }>();
  events
    .map((raw, index) => ({ parsed: parseFinishOptionsEvent(raw), index }))
    .filter((item): item is { parsed: FinishOptionsEvent; index: number } => Boolean(item.parsed))
    .filter(({ parsed }) => parsed.t <= tMs)
    .filter(({ index }) => tMs < finishOptionsExpiresAt(events, index))
    .sort((a, b) => a.parsed.t - b.parsed.t || a.index - b.index)
    .forEach(({ parsed, index }) => {
      latestByAttacker.set(parsed.from ?? `event-${index}`, { event: parsed, index });
    });
  return [...latestByAttacker.values()];
}

export function parseFinishOptionsEvent(event: EventRow): FinishOptionsEvent | null {
  if (event.kind !== "finish_options") return null;
  const rawOptions = (event as { options?: unknown }).options;
  if (!Array.isArray(rawOptions)) return null;

  const options = rawOptions.map(parseFinishOption).filter((option): option is FinishOption => Boolean(option));
  if (options.length === 0) return null;

  return {
    t: event.t,
    from: event.from,
    note: event.note,
    options,
  };
}

export function normalizeFinishOptions(event: EventRow | undefined): FinishOption[] {
  if (!event) return [];
  if (event.kind !== "finish_options") return [];
  const rawOptions = (event as { options?: unknown }).options;
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.map(parseFinishOption).filter((option): option is FinishOption => Boolean(option));
}

export function getActiveFinishOptionsEventIndex(
  events: TacticDocumentV1["events"],
  fromId: string | null | undefined,
  tMs: number,
): number | null {
  if (!events?.length || !fromId) return null;
  return getActiveFinishOptionsEvent(events, tMs, fromId)?.index ?? null;
}

export function makeFinishOptionsEvent(
  t: number,
  from: string,
  options: FinishOption[] = [],
): EventRow {
  return {
    t,
    kind: "finish_options",
    from,
    options,
  } as EventRow;
}
