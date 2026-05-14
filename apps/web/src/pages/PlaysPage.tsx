import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { DEFAULT_TACTIC_DOCUMENT, type TacticDocumentV1 } from "@volleyball/shared";
import {
  TACTIC_CATEGORY_KEYS,
  uniqueCategoryOptions,
  withDocumentCategory,
} from "../tactic/categories";
import { TEMPLATES, type Template } from "../tactic/templates";

type PlayListItem = { id: string; name: string; category?: string; teamId: string | null; teamIds: string[]; updatedAt: string };
type TeamPlayer = { id: string; name: string; number: number };
type Team = { id: string; name: string; color: string; players: TeamPlayer[] };

function miniCourtCoord(value: number, size: number) {
  return Math.max(0, Math.min(size, value * size));
}

function TemplateMiniCourt({ document: doc }: { document: TacticDocumentV1 }) {
  const firstFrame = doc.keyframes[0];
  const players = doc.actors.filter(
    (actor): actor is Extract<TacticDocumentV1["actors"][number], { type: "player" }> =>
      actor.type === "player",
  );
  const passRoutes = (doc.events ?? [])
    .filter((event) => event.kind === "pass" && event.from && event.to)
    .slice(0, 3);
  const poseFor = (actorId: string) => firstFrame?.poses[actorId];

  return (
    <svg className="template-mini-court" viewBox="0 0 100 50" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="97" height="47" rx="5" />
      <line x1="50" y1="2.5" x2="50" y2="47.5" className="template-mini-court__net" />
      <line x1="33" y1="2.5" x2="33" y2="47.5" />
      <line x1="67" y1="2.5" x2="67" y2="47.5" />
      {passRoutes.map((event, index) => {
        const from = event.from ? poseFor(event.from) : undefined;
        const to = event.to ? poseFor(event.to) : undefined;
        if (!from || !to) return null;
        return (
          <line
            key={`${event.t}-${event.from}-${event.to}-${index}`}
            x1={miniCourtCoord(from.x, 100)}
            y1={miniCourtCoord(from.y, 50)}
            x2={miniCourtCoord(to.x, 100)}
            y2={miniCourtCoord(to.y, 50)}
            className={`template-mini-court__route template-mini-court__route--${index + 1}`}
          />
        );
      })}
      {players.map((actor) => {
        const pose = poseFor(actor.id);
        if (!pose) return null;
        return (
          <g
            key={actor.id}
            className={`template-mini-court__player template-mini-court__player--${actor.team}`}
            transform={`translate(${miniCourtCoord(pose.x, 100)} ${miniCourtCoord(pose.y, 50)})`}
          >
            <circle r="3.2" />
            <text y="1.25">{actor.number}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PlaysPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<PlayListItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tacticCategories, setTacticCategories] = useState<string[]>([]);
  const [filterTeamId, setFilterTeamId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const defaultCategories = useMemo(() => TACTIC_CATEGORY_KEYS.map((key) => t(key)), [t]);
  const categoryOptions = useMemo(
    () => uniqueCategoryOptions([...defaultCategories, ...tacticCategories, ...items.map((item) => item.category)]),
    [defaultCategories, tacticCategories, items],
  );

  const loadTeams = useCallback(async () => {
    try {
      const res = await api<Team[]>("/api/v1/teams");
      setTeams(res);
    } catch {
      /* ignore */
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api<{ items: string[] }>("/api/v1/tactic-categories");
      setTacticCategories(res.items);
    } catch {
      /* Category presets still keep the page usable. */
    }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (filterTeamId) params.set("teamId", filterTeamId);
      if (filterCategory) params.set("category", filterCategory);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await api<{ items: PlayListItem[] }>(`/api/v1/plays${qs}`);
      setItems(res.items);
    } catch {
      setErr(t("plays.loadFailed"));
    }
  }, [filterCategory, filterTeamId, t]);

  useEffect(() => {
    if (user) {
      void loadTeams();
      void loadCategories();
    }
  }, [user, loadCategories, loadTeams]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return <Navigate to="/login" replace />;

  async function create() {
    setErr(null);
    const category = defaultCategories[0] ?? "";
    try {
      const body = {
        name: t("plays.defaultName"),
        description: "",
        category,
        tags: [] as string[],
        document: withDocumentCategory(DEFAULT_TACTIC_DOCUMENT, category),
        teamIds: [] as string[],
        libraryScope: "hidden" as const,
      };
      const res = await api<{ id: string }>("/api/v1/plays", {
        method: "POST",
        body: JSON.stringify(body),
      });
      nav(`/plays/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("plays.createFailed"));
    }
  }

  async function createFromTemplate(template: Template) {
    setErr(null);
    setCreatingTemplateId(template.id);
    try {
      const document = structuredClone(template.document) as TacticDocumentV1;
      const name = t(template.nameKey);
      const description = t(template.descKey);
      document.meta = {
        ...document.meta,
        name,
        description,
      };
      const res = await api<{ id: string }>("/api/v1/plays", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          category: document.meta.category ?? "",
          tags: document.meta.tags ?? [],
          document,
          teamIds: [] as string[],
          libraryScope: "hidden" as const,
        }),
      });
      nav(`/plays/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("plays.templateCreateFailed"));
    } finally {
      setCreatingTemplateId(null);
    }
  }

  const teamMap = new Map(teams.map((tm) => [tm.id, tm]));

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("plays.title")}</h1>
      <p className="hint">{t("plays.hint")}</p>
      {err ? <p className="error">{err}</p> : null}
      <section className="plays-command card" aria-label={t("plays.commandTitle")}>
        <div className="plays-command__header">
          <p className="home-kicker">{t("plays.commandKicker")}</p>
          <h2>{t("plays.commandTitle")}</h2>
          <p className="hint">{t("plays.commandHint")}</p>
        </div>
        <div className="plays-command__cards">
          <button type="button" className="plays-command-card plays-command-card--button" onClick={() => void create()}>
            <span>01</span>
            <strong>{t("plays.commandCreateTitle")}</strong>
            <small>{t("plays.commandCreateBody")}</small>
          </button>
          <Link to="/library" className="plays-command-card">
            <span>02</span>
            <strong>{t("plays.commandLibraryTitle")}</strong>
            <small>{t("plays.commandLibraryBody")}</small>
          </Link>
          <Link to="/match-preps" className="plays-command-card">
            <span>03</span>
            <strong>{t("plays.commandPrepTitle")}</strong>
            <small>{t("plays.commandPrepBody")}</small>
          </Link>
        </div>
      </section>
      <section className="template-starter card" aria-label={t("plays.starterTitle")}>
        <div className="template-starter__header">
          <div>
            <p className="home-kicker">{t("plays.starterKicker")}</p>
            <h2>{t("plays.starterTitle")}</h2>
            <p className="hint">{t("plays.starterHint")}</p>
          </div>
          <Link to="/library" className="btn btn-ghost">
            {t("plays.starterBrowseAll")}
          </Link>
        </div>
        <div className="template-starter__grid">
          {TEMPLATES.map((template) => {
            const tags = template.document.meta.tags?.slice(0, 3) ?? [];
            const isCreating = creatingTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                className="template-starter-card"
                onClick={() => void createFromTemplate(template)}
                disabled={creatingTemplateId !== null}
              >
                <TemplateMiniCourt document={template.document} />
                <span className="status-pill">{template.document.meta.category ?? t("playCategory.uncategorized")}</span>
                <strong>{t(template.nameKey)}</strong>
                <small>{t(template.descKey)}</small>
                {tags.length ? <em>{tags.join(" / ")}</em> : null}
                <span className="template-starter-card__cta">
                  {isCreating ? t("plays.starterCreating") : t("plays.starterUse")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <button type="button" className="btn btn-primary" onClick={() => void create()}>
          {t("plays.create")}
        </button>
        {teams.length > 0 && (
          <select
            className="btn"
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            style={{ minWidth: 120 }}
          >
            <option value="">{t("plays.allTeams")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        )}
        {categoryOptions.length > 0 && (
          <select
            className="btn"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="">{t("plays.allCategories")}</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="list">
        {items.map((p) => {
          const assignedTeamIds = p.teamIds?.length ? p.teamIds : p.teamId ? [p.teamId] : [];
          const assignedTeams = assignedTeamIds.map((teamId) => teamMap.get(teamId)).filter((tm): tm is Team => !!tm);
          return (
            <Link key={p.id} to={`/plays/${p.id}`} className="list-item list-item--link">
              <div>
                <h3>
                  <span className="list-item__title">{p.name}</span>
                  {p.category ? (
                    <span className="status-pill" style={{ marginLeft: "0.5rem" }}>
                      {p.category}
                    </span>
                  ) : null}
                </h3>
                <div className="muted">
                  {assignedTeams.length ? (
                    <span style={{ marginRight: "0.5rem" }}>
                      {assignedTeams.map((team) => (
                        <span key={team.id} style={{ marginRight: "0.45rem" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: team.color,
                              marginRight: 4,
                            }}
                          />
                          {team.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span style={{ marginRight: "0.5rem" }}>{t("plays.availableAllTeams")}</span>
                  )}
                  {t("plays.updatedAt")} {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
            </Link>
          );
        })}
        {items.length === 0 && !err ? (
          <div className="empty-state">
            <p className="home-kicker">{t("plays.emptyKicker")}</p>
            <h2>{t("plays.emptyTitle")}</h2>
            <p className="muted">{t("plays.empty")}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => void create()}>
                {t("plays.create")}
              </button>
              <Link to="/library" className="btn btn-ghost">
                {t("plays.emptyLibrary")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
