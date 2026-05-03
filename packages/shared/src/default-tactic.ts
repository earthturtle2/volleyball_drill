import type { TacticDocumentV1 } from "./tactic-v1.zod.js";

export const DEFAULT_TACTIC_DOCUMENT: TacticDocumentV1 = {
  schemaVersion: 1,
  meta: {
    name: "新排球战术",
    description: "",
    tags: [],
    court: {
      preset: "full",
      orientation: "home_on_right",
      sizeMeters: { length: 18, width: 9 },
    },
    durationMs: 2000,
  },
  teams: {
    offense: { id: "home", label: "本队", color: "#38bdf8" },
    defense: { id: "away", label: "对手", color: "#f59e0b" },
  },
  actors: [],
  keyframes: [
    { t: 0, poses: {} },
    { t: 2000, poses: {} },
  ],
  interpolation: { position: "linear", facing: "shortestAngle" },
  rules: { coordinateSystem: "normalized", bounds: { x: [0, 1], y: [0, 1] } },
};
