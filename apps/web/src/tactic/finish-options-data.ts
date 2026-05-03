import type { TacticDocumentV1 } from "@volleyball/shared";

export type FinishOptionKind = "shot" | "pass";

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
  const kind: FinishOptionKind | null = rawKind === "shot" || rawKind === "pass" ? rawKind : null;
  if (!kind) return null;

  const option: FinishOption = {
    kind,
    label: stringValue(value.label),
    to: stringValue(value.to),
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    priority: stringValue(value.priority),
  };

  if (option.to || (option.x !== undefined && option.y !== undefined)) return option;
  return null;
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
  const withIdx = events.map((e, i) => ({ e, i }));
  const candidates = withIdx
    .filter(({ e }) => e.kind === "finish_options" && e.from === fromId && e.t <= tMs)
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  return candidates.at(-1)?.i ?? null;
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
