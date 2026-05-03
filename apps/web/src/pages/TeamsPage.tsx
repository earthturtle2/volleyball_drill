import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

type TeamPlayer = { id: string; name: string; number: number };
type Team = { id: string; name: string; color: string; players: TeamPlayer[]; createdAt: string };

const DEFAULT_TEAM_COLOR = "#38bdf8";

function newPlayer(number: number): TeamPlayer {
  return {
    id: `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${number}`,
    name: "",
    number,
  };
}

function defaultPlayers(): TeamPlayer[] {
  return [1, 2, 3, 4, 5, 6].map(newPlayer);
}

function normalizePlayers(players: TeamPlayer[]): TeamPlayer[] {
  return players
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      number: Math.max(0, Math.min(99, Math.round(p.number || 0))),
    }))
    .filter((p) => p.id && p.number >= 0);
}

function PlayerRosterEditor({
  players,
  onChange,
}: {
  players: TeamPlayer[];
  onChange: (players: TeamPlayer[]) => void;
}) {
  const { t } = useT();

  return (
    <div className="team-roster">
      <div className="team-roster__header">
        <label>{t("teams.players")}</label>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => onChange([...players, newPlayer((players.at(-1)?.number ?? players.length) + 1)])}
        >
          {t("teams.addPlayer")}
        </button>
      </div>
      <div className="team-roster__rows">
        {players.map((p, idx) => (
          <div key={p.id} className="team-roster__row">
            <input
              type="number"
              min={0}
              max={99}
              value={p.number}
              aria-label={t("teams.playerNumber")}
              onChange={(e) => {
                const next = [...players];
                next[idx] = { ...p, number: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
            <input
              value={p.name}
              placeholder={t("teams.playerNamePlaceholder")}
              aria-label={t("teams.playerName")}
              onChange={(e) => {
                const next = [...players];
                next[idx] = { ...p, name: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onChange(players.filter((_, i) => i !== idx))}
            >
              {t("teams.removePlayer")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamsPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TEAM_COLOR);
  const [players, setPlayers] = useState<TeamPlayer[]>(() => defaultPlayers());
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editPlayers, setEditPlayers] = useState<TeamPlayer[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await api<Team[]>("/api/v1/teams");
      setTeams(res);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 401 ? t("teams.loginRequired") : t("teams.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (loading) return <p className="hint">{t("view.loading")}</p>;
  if (!user) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 0.5rem" }}>{t("teams.title")}</h1>
        <p className="error">{t("teams.loginRequired")}</p>
        <Link to="/login" className="btn btn-primary">
          {t("app.login")}
        </Link>
      </div>
    );
  }

  async function create() {
    if (!name.trim()) return;
    setErr(null);
    try {
      await api("/api/v1/teams", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), color, players: normalizePlayers(players) }),
      });
      setName("");
      setColor(DEFAULT_TEAM_COLOR);
      setPlayers(defaultPlayers());
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("teams.createFailed"));
    }
  }

  async function update(id: string) {
    setErr(null);
    try {
      await api(`/api/v1/teams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, color: editColor, players: normalizePlayers(editPlayers) }),
      });
      setEditId(null);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("teams.updateFailed"));
    }
  }

  async function remove(id: string) {
    if (!confirm(t("teams.confirmDelete"))) return;
    setErr(null);
    try {
      await api(`/api/v1/teams/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("teams.deleteFailed"));
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("teams.title")}</h1>
      <p className="hint">{t("teams.hint")}</p>
      {err ? <p className="error">{err}</p> : null}

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
          <div className="field" style={{ flex: 1, minWidth: 120, margin: 0 }}>
            <label>{t("teams.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teams.namePlaceholder")} />
          </div>
          <div className="field" style={{ margin: 0, width: 60 }}>
            <label>{t("teams.color")}</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: "2px", height: 36 }} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void create()}>
            {t("teams.add")}
          </button>
        </div>
        <PlayerRosterEditor players={players} onChange={setPlayers} />
      </div>

      <div className="list">
        {teams.map((tm) => (
          <div key={tm.id} className="list-item">
            {editId === tm.id ? (
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flex: 1 }}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ flex: 1, minWidth: 100 }}
                  />
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    style={{ width: 40, padding: "2px", height: 32 }}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => void update(tm.id)}>
                    {t("teams.save")}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>
                    {t("teams.cancel")}
                  </button>
                </div>
                <PlayerRosterEditor players={editPlayers} onChange={setEditPlayers} />
              </div>
            ) : (
              <>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: tm.color,
                        flexShrink: 0,
                      }}
                    />
                    <h3>{tm.name}</h3>
                  </div>
                  <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                    {(tm.players?.length ? tm.players : defaultPlayers())
                      .map((p) => `${p.number}${p.name ? ` ${p.name}` : ""}`)
                      .join(" / ")}
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setEditId(tm.id);
                      setEditName(tm.name);
                      setEditColor(tm.color);
                      setEditPlayers(tm.players?.length ? tm.players : defaultPlayers());
                    }}
                  >
                    {t("teams.edit")}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void remove(tm.id)}>
                    {t("teams.delete")}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {teams.length === 0 && !err ? (
          <p className="muted">{t("teams.empty")}</p>
        ) : null}
      </div>
    </div>
  );
}
