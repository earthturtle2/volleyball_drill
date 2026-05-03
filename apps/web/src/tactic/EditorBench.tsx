import type { TacticDocumentV1 } from "@volleyball/shared";
import type { CourtMode } from "./court-geometry";
import { useT } from "../i18n";

export type EditorTool = "select" | "addOffense" | "addDefense" | "pass" | "screen" | "finish";

type PlayerActor = {
  id: string;
  type: "player";
  team: "offense" | "defense";
  number: number;
  label: string;
};

export type BenchPlayerOption = {
  id: string;
  name: string;
  number: number;
  label: string;
  disabled?: boolean;
};

export type BenchFinishOption = {
  kind: "shot" | "pass" | "tip" | "cover";
  label: string;
  targetLabel: string;
  priority?: string;
};

interface Props {
  side: "left" | "right";
  tool: EditorTool;
  onToolChange: (t: EditorTool) => void;
  courtMode: CourtMode;
  onCourtModeChange: (m: CourtMode) => void;
  doc: TacticDocumentV1;
  selectedActor: PlayerActor | null;
  ballHolderId: string | undefined;
  passSource: string | null;
  screenAngle: number | undefined;
  finishOptions: BenchFinishOption[];
  onActorUpdate: (id: string, updates: { label?: string; number?: number }) => void;
  onToggleBall: (actorId: string) => void;
  onRemoveActor: () => void;
  onOpenTemplates: () => void;
  onClearFrameAction: () => void;
  canClearFrameAction: boolean;
  onScreenAngleChange: (angle: number) => void;
  onRemoveScreen: () => void;
  onFinishOptionLabelChange: (idx: number, label: string) => void;
  onFinishOptionPriorityChange: (idx: number, priority: string) => void;
  onRemoveFinishOption: (idx: number) => void;
  onClearFinishOptions: () => void;
  availablePlayers: BenchPlayerOption[];
  pendingPlayer: BenchPlayerOption | null;
  onRosterPlayerSelect: (player: BenchPlayerOption) => void;
  canUseOffenseTool: boolean;
  canUseDefenseTool: boolean;
  canUseRosterPlayers: boolean;
}

export function EditorBench({
  side,
  tool,
  onToolChange,
  courtMode,
  onCourtModeChange,
  selectedActor,
  ballHolderId,
  passSource,
  screenAngle,
  finishOptions,
  onActorUpdate,
  onToggleBall,
  onRemoveActor,
  onOpenTemplates,
  onClearFrameAction,
  canClearFrameAction,
  onScreenAngleChange,
  onRemoveScreen,
  onFinishOptionLabelChange,
  onFinishOptionPriorityChange,
  onRemoveFinishOption,
  onClearFinishOptions,
  availablePlayers,
  pendingPlayer,
  onRosterPlayerSelect,
  canUseOffenseTool,
  canUseDefenseTool,
  canUseRosterPlayers,
}: Props) {
  const { t } = useT();
  const sideClass = side === "left" ? "editor-bench--left" : "editor-bench--right";

  if (side === "right") {
    return (
      <div className={`editor-bench ${sideClass}`}>
        <div className="bench-section">
          <div className="bench-label">{t("bench.playerActions")}</div>
          <div className="bench-row">
            <button
              type="button"
              className={`btn btn-sm ${tool === "pass" ? "btn-active" : ""}`}
              onClick={() => onToolChange(tool === "pass" ? "select" : "pass")}
            >
              {t("bench.pass")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tool === "screen" ? "btn-active" : ""}`}
              onClick={() => onToolChange(tool === "screen" ? "select" : "screen")}
            >
              {t("bench.screen")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tool === "finish" ? "btn-active" : ""}`}
              disabled={!selectedActor}
              onClick={() => onToolChange(tool === "finish" ? "select" : "finish")}
            >
              {t("bench.finish")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!canClearFrameAction}
              onClick={onClearFrameAction}
              title={t("bench.clearFrameActionTitle")}
            >
              {t("bench.clearFrameAction")}
            </button>
          </div>
          {tool === "pass" && !passSource && <p className="bench-tip">{t("bench.tipPassFrom")}</p>}
          {tool === "pass" && passSource && <p className="bench-tip">{t("bench.tipPassTo")}</p>}
          {tool === "screen" && <p className="bench-tip">{t("bench.tipScreen")}</p>}
          {tool === "finish" && <p className="bench-tip">{t("bench.tipFinish")}</p>}
        </div>

        {selectedActor ? (
          <div className="bench-section">
            <div className="bench-label">{t("bench.playerProps")}</div>
            <div className="bench-field">
              <label>{t("bench.playerName")}</label>
              <input
                value={selectedActor.label}
                onChange={(e) => onActorUpdate(selectedActor.id, { label: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="bench-field">
              <label>{t("bench.playerNumber")}</label>
              <input
                type="number"
                min={0}
                max={99}
                value={selectedActor.number}
                onChange={(e) => onActorUpdate(selectedActor.id, { number: Number(e.target.value) || 0 })}
                style={{ width: 70 }}
              />
            </div>
            <div className="bench-row" style={{ marginTop: "0.4rem" }}>
              <button
                type="button"
                className={`btn btn-sm ${ballHolderId === selectedActor.id ? "btn-active" : ""}`}
                onClick={() => onToggleBall(selectedActor.id)}
              >
                {t("bench.holdBall")}
              </button>
            </div>
          </div>
        ) : (
          <div className="bench-section bench-section--empty">
            <div className="bench-label">{t("bench.playerProps")}</div>
            <p className="bench-hint">{t("bench.selectPlayerHint")}</p>
          </div>
        )}

        {screenAngle !== undefined && selectedActor ? (
          <div className="bench-section">
            <div className="bench-label">{t("bench.screenAngle")}</div>
            <div className="bench-row bench-row--directions">
              {[
                { label: "↑", a: 0 },
                { label: "↗", a: 45 },
                { label: "→", a: 90 },
                { label: "↘", a: 135 },
                { label: "↓", a: 180 },
                { label: "↙", a: 225 },
                { label: "←", a: 270 },
                { label: "↖", a: 315 },
              ].map((d) => (
                <button
                  key={d.a}
                  type="button"
                  className={`btn btn-sm ${screenAngle === d.a ? "btn-active" : ""}`}
                  style={{ minWidth: 32, padding: "0.25rem" }}
                  onClick={() => onScreenAngleChange(d.a)}
                  title={`${d.a}°`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: "0.3rem" }}
              onClick={onRemoveScreen}
            >
              {t("bench.removeScreen")}
            </button>
          </div>
        ) : null}

        {selectedActor && (tool === "finish" || finishOptions.length > 0) ? (
          <div className="bench-section">
            <div className="bench-label">{t("bench.finishOptions")}</div>
            {finishOptions.length === 0 ? (
              <p className="bench-hint">{t("bench.finishEmpty")}</p>
            ) : (
              <div className="bench-finish-list">
                {finishOptions.map((option, idx) => (
                  <div key={idx} className="bench-finish-option">
                    <div className="bench-finish-option__meta">
                      <span className={`bench-finish-pill bench-finish-pill--${option.kind}`}>
                        {option.kind === "shot" ? t("bench.finishShot") : t("bench.finishPass")}
                      </span>
                      <span className="bench-hint">{option.targetLabel}</span>
                    </div>
                    <input
                      value={option.label}
                      onChange={(e) => onFinishOptionLabelChange(idx, e.target.value)}
                      aria-label={t("bench.finishLabel")}
                    />
                    <div className="bench-row">
                      <select
                        value={option.priority ?? "counter"}
                        onChange={(e) => onFinishOptionPriorityChange(idx, e.target.value)}
                        aria-label={t("bench.finishPriority")}
                      >
                        <option value="primary">{t("bench.finishPrimary")}</option>
                        <option value="counter">{t("bench.finishCounter")}</option>
                        <option value="safety">{t("bench.finishSafety")}</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onRemoveFinishOption(idx)}
                      >
                        {t("bench.finishRemove")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {finishOptions.length > 0 ? (
              <button type="button" className="btn btn-sm" onClick={onClearFinishOptions}>
                {t("bench.finishClear")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`editor-bench ${sideClass}`}>
      <div className="bench-section">
        <div className="bench-label">{t("bench.court")}</div>
        <div className="bench-row">
          <button
            type="button"
            className={`btn btn-sm ${courtMode === "half" ? "btn-active" : ""}`}
            onClick={() => onCourtModeChange("half")}
          >
            {t("bench.half")}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${courtMode === "full" ? "btn-active" : ""}`}
            onClick={() => onCourtModeChange("full")}
          >
            {t("bench.full")}
          </button>
        </div>
      </div>

      <div className="bench-section">
        <div className="bench-label">{t("bench.players")}</div>
        <div className="bench-row">
          <button
            type="button"
            className={`bench-token bench-token--offense ${tool === "addOffense" ? "bench-token--active" : ""}`}
            disabled={!canUseOffenseTool}
            onClick={() => onToolChange(tool === "addOffense" ? "select" : "addOffense")}
            title={t("bench.addOffenseTitle")}
          >
            +
          </button>
          <span className="bench-hint">{t("bench.offense")}</span>
          <button
            type="button"
            className={`bench-token bench-token--defense ${tool === "addDefense" ? "bench-token--active" : ""}`}
            disabled={!canUseDefenseTool}
            onClick={() => onToolChange(tool === "addDefense" ? "select" : "addDefense")}
            title={t("bench.addDefenseTitle")}
          >
            +
          </button>
          <span className="bench-hint">{t("bench.defense")}</span>
        </div>
      </div>

      <div className="bench-section">
        <div className="bench-label">{t("bench.overall")}</div>
        <div className="bench-row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onOpenTemplates}
          >
            {t("bench.template")}
          </button>
          <button type="button" className="btn btn-sm" disabled={!selectedActor} onClick={onRemoveActor}>
            {t("bench.remove")}
          </button>
        </div>
        {pendingPlayer ? (
          <p className="bench-tip">{t("bench.tipRosterReplace")}</p>
        ) : tool === "addOffense" ? (
          <p className="bench-tip">{t("bench.tipAddOffense")}</p>
        ) : null}
        {tool === "addDefense" && <p className="bench-tip">{t("bench.tipAddDefense")}</p>}
        {!canUseOffenseTool && !pendingPlayer && <p className="bench-hint">{t("bench.maxOffense")}</p>}
        {!canUseDefenseTool && <p className="bench-hint">{t("bench.maxDefense")}</p>}
      </div>

      <div className="bench-section">
        <div className="bench-label">{t("bench.teamRoster")}</div>
        <div className="bench-roster-grid">
          {availablePlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className={`bench-roster-player${pendingPlayer?.id === player.id ? " bench-roster-player--active" : ""}`}
              disabled={player.disabled || !canUseRosterPlayers}
              onClick={() => onRosterPlayerSelect(player)}
              title={player.disabled ? t("bench.rosterPlayerInUse") : player.label}
            >
              <span className="bench-roster-dot">{player.number}</span>
              {player.name ? <small>{player.name}</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
