import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { TacticDocumentV1 } from "@volleyball/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { PlaybackPreviewSection } from "../tactic/PlaybackPreviewSection";
import {
  TACTIC_CATEGORY_KEYS,
  buildCategoryLetterMap,
  formatCategoryCode,
  uniqueCategoryOptions,
} from "../tactic/categories";

type TeamPlayer = { id: string; name: string; number: number };
type Team = { id: string; name: string; color: string; players: TeamPlayer[] };
type PlayListItem = { id: string; name: string; category?: string; teamId: string | null; teamIds: string[]; updatedAt: string };
type PrepListItem = {
  id: string;
  title: string;
  opponent: string | null;
  gameDate: string | null;
  notes: string | null;
  teamId: string | null;
  entryCount: number;
  categories: string[];
  updatedAt: string;
  createdAt: string;
};
type PrepEntryPlay = {
  id: string;
  name: string;
  description: string | null;
  category?: string;
  tags: string[];
  teamId: string | null;
  teamIds: string[];
  document: TacticDocumentV1;
  updatedAt: string;
};
type PrepEntry = {
  id: string;
  playId: string;
  code: string;
  category: string;
  cue?: string;
  notes?: string;
  sortOrder: number;
  play: PrepEntryPlay | null;
};
type PrepDetail = PrepListItem & { entries: PrepEntry[] };
type PrepShare = { shareId: string; token: string; viewUrl: string; expiresAt: string | null; createdAt: string };
type SaveStatus = "saved" | "saving" | "unsaved";

function localDateInputValue(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function makeLocalEntryId() {
  return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortEntries(entries: PrepEntry[]) {
  return [...entries].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function entryPayload(entries: PrepEntry[]) {
  return entries.map((entry, index) => ({
    id: entry.id,
    playId: entry.playId,
    code: entry.code.trim(),
    category: entry.category.trim(),
    cue: entry.cue?.trim() || null,
    notes: entry.notes?.trim() || null,
    sortOrder: index,
  }));
}

function entryCodeKey(category: string, code: string) {
  return `${category.trim().toLocaleLowerCase()}\u0000${code.trim().toLocaleLowerCase()}`;
}

function playAssignedToTeam(play: PlayListItem, teamId: string) {
  const ids = play.teamIds?.length ? play.teamIds : play.teamId ? [play.teamId] : [];
  return ids.length === 0 || ids.includes(teamId);
}

function MatchPrepListPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<PrepListItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterTeamId, setFilterTeamId] = useState("");
  const [title, setTitle] = useState(t("matchPrep.defaultTitle"));
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [teamId, setTeamId] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const res = await api<Team[]>("/api/v1/teams");
      setTeams(res);
    } catch {
      /* Match preparation can still work without team filters. */
    }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filterTeamId) params.set("teamId", filterTeamId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await api<{ items: PrepListItem[] }>(`/api/v1/match-preps${qs}`);
      setItems(res.items);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.loadFailed"));
    }
  }, [filterTeamId, q, t]);

  useEffect(() => {
    if (user) {
      void loadTeams();
    }
  }, [user, loadTeams]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return <Navigate to="/login" replace />;

  async function create() {
    if (!title.trim() || creating) return;
    setCreating(true);
    setErr(null);
    try {
      const res = await api<PrepDetail>("/api/v1/match-preps", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          opponent: opponent.trim() || null,
          gameDate: gameDate || null,
          teamId: teamId || null,
          entries: [],
        }),
      });
      nav(`/match-preps/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  const teamMap = new Map(teams.map((tm) => [tm.id, tm]));

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("matchPrep.title")}</h1>
      <p className="hint">{t("matchPrep.hint")}</p>
      {err ? <p className="error">{err}</p> : null}

      <div className="match-prep-hero card">
        <div>
          <p className="match-prep-kicker">{t("matchPrep.workflow")}</p>
          <h2>{t("matchPrep.heroTitle")}</h2>
          <p className="muted">{t("matchPrep.heroHint")}</p>
        </div>
        <div className="match-prep-hero__steps">
          <span>{t("matchPrep.stepPick")}</span>
          <span>{t("matchPrep.stepCode")}</span>
          <span>{t("matchPrep.stepPlay")}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.1rem" }}>{t("matchPrep.newPlan")}</h2>
        <div className="match-prep-form-grid">
          <div className="field">
            <label>{t("matchPrep.planTitle")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("matchPrep.opponent")}</label>
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder={t("matchPrep.opponentPlaceholder")} />
          </div>
          <div className="field">
            <label>{t("matchPrep.gameDate")}</label>
            <input type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("matchPrep.team")}</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">{t("matchPrep.noTeam")}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={creating || !title.trim()}>
          {creating ? t("matchPrep.creating") : t("matchPrep.create")}
        </button>
      </div>

      <div className="match-prep-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("matchPrep.searchPlaceholder")} />
        {teams.length > 0 ? (
          <select value={filterTeamId} onChange={(e) => setFilterTeamId(e.target.value)}>
            <option value="">{t("plays.allTeams")}</option>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="list">
        {items.map((prep) => {
          const team = prep.teamId ? teamMap.get(prep.teamId) : undefined;
          return (
            <Link key={prep.id} to={`/match-preps/${prep.id}`} className="list-item list-item--link match-prep-list-card">
              <div>
                <h3>
                  <span className="list-item__title">{prep.title}</span>
                </h3>
                <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                  {prep.opponent ? `${t("matchPrep.vs")} ${prep.opponent} · ` : ""}
                  {prep.gameDate ? `${formatDate(prep.gameDate)} · ` : ""}
                  {team ? `${team.name} · ` : ""}
                  {t("matchPrep.entryCount").replace("{count}", String(prep.entryCount))}
                </p>
              </div>
              <div className="match-prep-list-card__chips">
                {prep.categories.slice(0, 4).map((category) => (
                  <span key={category} className="status-pill">
                    {category}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
        {items.length === 0 && !err ? <p className="muted">{t("matchPrep.empty")}</p> : null}
      </div>
    </div>
  );
}

function MatchPrepDetailPage({ prepId }: { prepId: string }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const defaultCategories = useMemo(() => TACTIC_CATEGORY_KEYS.map((key) => t(key)), [t]);
  const [prep, setPrep] = useState<PrepDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [plays, setPlays] = useState<PlayListItem[]>([]);
  const [tacticCategories, setTacticCategories] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [teamId, setTeamId] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<PrepEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [newPlayId, setNewPlayId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCategory, setNewCategory] = useState(defaultCategories[0] ?? "");
  const [newCue, setNewCue] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const markUnsaved = useCallback(() => setSaveStatus("unsaved"), []);

  const loadTeams = useCallback(async () => {
    try {
      const res = await api<Team[]>("/api/v1/teams");
      setTeams(res);
    } catch {
      /* Optional context only. */
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api<{ items: string[] }>("/api/v1/tactic-categories");
      setTacticCategories(res.items);
    } catch {
      /* Built-in category options are enough to keep editing available. */
    }
  }, []);

  const loadPlays = useCallback(async () => {
    try {
      const res = await api<{ items: PlayListItem[] }>("/api/v1/plays?pageSize=100");
      setPlays(res.items);
      const firstPlay = res.items[0];
      setNewPlayId((current) => current || firstPlay?.id || "");
      setNewCategory((current) =>
        !current || defaultCategories.includes(current)
          ? firstPlay?.category || defaultCategories[0] || ""
          : current,
      );
    } catch {
      /* The detail page still loads; adding entries needs this list. */
    }
  }, [defaultCategories]);

  const applyPrep = useCallback((next: PrepDetail) => {
    setPrep(next);
    setTitle(next.title);
    setOpponent(next.opponent ?? "");
    setGameDate(localDateInputValue(next.gameDate));
    setTeamId(next.teamId ?? "");
    setNotes(next.notes ?? "");
    const sorted = sortEntries(next.entries);
    setEntries(sorted);
    setSelectedEntryId((current) => (current && sorted.some((entry) => entry.id === current) ? current : sorted[0]?.id ?? null));
    setSaveStatus("saved");
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await api<PrepDetail>(`/api/v1/match-preps/${prepId}`);
      applyPrep(res);
      const shares = await api<PrepShare[]>(`/api/v1/match-preps/${prepId}/shares`);
      setShareUrl(shares[0]?.viewUrl ?? null);
      setShareCopied(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.loadFailed"));
    }
  }, [applyPrep, prepId, t]);

  useEffect(() => {
    if (user) {
      void loadTeams();
      void loadCategories();
      void loadPlays();
      void load();
    }
  }, [user, load, loadTeams, loadCategories, loadPlays]);

  useEffect(() => {
    if (!newCategory && defaultCategories[0]) setNewCategory(defaultCategories[0]);
  }, [defaultCategories, newCategory]);

  if (!user) return <Navigate to="/login" replace />;

  const save = async () => {
    if (!title.trim() || saveStatus === "saving") return false;
    const normalizedEntries = entryPayload(entries);
    const duplicateCode = normalizedEntries.find((entry, index) =>
      normalizedEntries.some(
        (other, otherIndex) =>
          otherIndex !== index && entryCodeKey(other.category, other.code) === entryCodeKey(entry.category, entry.code),
      ),
    );
    if (duplicateCode) {
      setErr(t("matchPrep.duplicateCode"));
      return false;
    }
    setSaveStatus("saving");
    setErr(null);
    try {
      const res = await api<PrepDetail>(`/api/v1/match-preps/${prepId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          opponent: opponent.trim() || null,
          gameDate: gameDate || null,
          teamId: teamId || null,
          notes: notes.trim() || null,
          entries: normalizedEntries,
        }),
      });
      applyPrep(res);
      return true;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.saveFailed"));
      setSaveStatus("unsaved");
      return false;
    }
  };

  async function removePrep() {
    if (!confirm(t("matchPrep.confirmDelete"))) return;
    setErr(null);
    try {
      await api(`/api/v1/match-preps/${prepId}`, { method: "DELETE" });
      nav("/match-preps", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.deleteFailed"));
    }
  }

  async function sharePrep() {
    if (sharing) return;
    setSharing(true);
    setErr(null);
    setShareCopied(false);
    try {
      if (saveStatus === "unsaved") {
        const saved = await save();
        if (!saved) return;
      }
      const existing = await api<PrepShare[]>(`/api/v1/match-preps/${prepId}/shares`);
      if (existing[0]) {
        setShareUrl(existing[0].viewUrl);
        return;
      }
      const share = await api<PrepShare>(`/api/v1/match-preps/${prepId}/shares`, {
        method: "POST",
        body: "{}",
      });
      setShareUrl(share.viewUrl);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("matchPrep.shareFailed"));
    } finally {
      setSharing(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  function addEntry() {
    const selectedPlay = plays.find((play) => play.id === newPlayId);
    const entryCategory = (newCategory.trim() || selectedPlay?.category || "").trim();
    if (!newPlayId || !newCode.trim() || !entryCategory) return;
    if (entries.some((entry) => entryCodeKey(entry.category, entry.code) === entryCodeKey(entryCategory, newCode))) {
      setErr(t("matchPrep.duplicateCode"));
      return;
    }
    const existingPlay = prep?.entries.find((candidate) => candidate.playId === newPlayId)?.play ?? null;
    const entry: PrepEntry = {
      id: makeLocalEntryId(),
      playId: newPlayId,
      code: newCode.trim(),
      category: entryCategory,
      cue: newCue.trim() || undefined,
      notes: undefined,
      sortOrder: entries.length,
      play: existingPlay,
    };
    setEntries((prev) => [...prev, entry]);
    setSelectedEntryId(entry.id);
    setNewCode("");
    setNewCue("");
    setErr(null);
    markUnsaved();
  }

  function updateEntry(id: string, patch: Partial<Pick<PrepEntry, "playId" | "code" | "category" | "cue" | "notes">>) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
            ...entry,
            ...patch,
            play: patch.playId && patch.playId !== entry.playId ? null : entry.play,
          }
          : entry,
      ),
    );
    markUnsaved();
  }

  function moveEntry(id: string, dir: -1 | 1) {
    setEntries((prev) => {
      const next = sortEntries(prev);
      const idx = next.findIndex((entry) => entry.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= next.length) return prev;
      const [entry] = next.splice(idx, 1);
      next.splice(target, 0, entry);
      return next.map((item, index) => ({ ...item, sortOrder: index }));
    });
    markUnsaved();
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id).map((entry, index) => ({ ...entry, sortOrder: index })));
    if (selectedEntryId === id) {
      const next = entries.find((entry) => entry.id !== id);
      setSelectedEntryId(next?.id ?? null);
    }
    markUnsaved();
  }

  const sortedEntries = sortEntries(entries);
  const categories = [...new Set(sortedEntries.map((entry) => entry.category).filter(Boolean))];
  const categoryLetterMap = buildCategoryLetterMap(categories);
  const displayEntryCode = (entry: Pick<PrepEntry, "category" | "code">) =>
    formatCategoryCode(entry, categoryLetterMap);
  const categoryOptions = uniqueCategoryOptions([
    ...defaultCategories,
    ...tacticCategories,
    ...plays.map((play) => play.category),
    ...categories,
    newCategory,
  ]);
  const playOptions = teamId ? plays.filter((play) => playAssignedToTeam(play, teamId)) : plays;
  const selectedEntry = sortedEntries.find((entry) => entry.id === selectedEntryId) ?? sortedEntries[0];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const playMap = new Map(plays.map((play) => [play.id, play]));
  const filteredEntries = sortedEntries.filter((entry) => {
    if (categoryFilter && entry.category !== categoryFilter) return false;
    if (!normalizedSearch) return true;
    const haystack = [displayEntryCode(entry), entry.code, entry.category, entry.cue ?? "", entry.play?.name ?? playMap.get(entry.playId)?.name ?? ""].join(" ").toLocaleLowerCase();
    return haystack.includes(normalizedSearch);
  });
  const compactEntries = categoryFilter
    ? sortedEntries.filter((entry) => entry.category === categoryFilter)
    : sortedEntries;
  const teamMap = new Map(teams.map((tm) => [tm.id, tm]));
  const activeTeam = teamId ? teamMap.get(teamId) : null;

  const statusLabel = {
    saved: t("edit.statusSaved"),
    saving: t("edit.statusSaving"),
    unsaved: t("edit.statusUnsaved"),
  }[saveStatus];

  function selectCategoryFilter(nextCategory: string) {
    setCategoryFilter(nextCategory);
    if (!nextCategory || selectedEntry?.category === nextCategory) return;
    const firstInCategory = sortedEntries.find((entry) => entry.category === nextCategory);
    if (firstInCategory) setSelectedEntryId(firstInCategory.id);
  }

  return (
    <div className="match-prep-detail">
      <p className="match-prep-detail__crumb" style={{ margin: "0 0 0.5rem" }}>
        <Link to="/match-preps" className="muted">
          {t("matchPrep.back")}
        </Link>
      </p>
      <div className="match-prep-detail__title" style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>{t("matchPrep.detailTitle")}</h1>
        <span className={`save-status save-status--${saveStatus}`}>{statusLabel}</span>
      </div>
      <p className="hint match-prep-detail__hint">{t("matchPrep.detailHint")}</p>
      {err ? <p className="error">{err}</p> : null}
      {!prep && !err ? <p className="hint">{t("view.loading")}</p> : null}

      {prep ? (
        <>
          <div className="match-prep-share-panel card">
            <div>
              <p className="match-prep-kicker">{t("matchPrep.shareTitle")}</p>
              <h2>{t("matchPrep.shareHeading")}</h2>
              <p className="muted">{t("matchPrep.shareHint")}</p>
            </div>
            <div className="match-prep-share-panel__actions">
              <button type="button" className="btn btn-primary" onClick={() => void sharePrep()} disabled={sharing}>
                {sharing ? t("matchPrep.shareSaving") : t("matchPrep.share")}
              </button>
              {shareUrl ? (
                <a className="btn btn-ghost" href={shareUrl} target="_blank" rel="noreferrer">
                  {t("matchPrep.shareOpen")}
                </a>
              ) : null}
            </div>
            {shareUrl ? (
              <div className="match-prep-share-link">
                <span>{t("matchPrep.viewHint")}</span>
                <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
                <button type="button" className="btn btn-sm" onClick={() => void copyShareUrl()}>
                  {shareCopied ? t("matchPrep.shareCopied") : t("matchPrep.shareCopy")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="match-prep-console">
            <section className="match-prep-stage card">
              <div className="match-prep-stage__header">
                <div>
                  <p className="match-prep-kicker">{t("matchPrep.nowPlaying")}</p>
                  <h2>{selectedEntry ? selectedEntry.play?.name ?? playMap.get(selectedEntry.playId)?.name ?? t("matchPrep.unavailablePlay") : t("matchPrep.noSelected")}</h2>
                  {selectedEntry ? (
                    <p className="muted">
                      <span className="match-code" title={selectedEntry.category}>{displayEntryCode(selectedEntry)}</span>
                      {selectedEntry.cue ? <span> · {selectedEntry.cue}</span> : null}
                    </p>
                  ) : null}
                </div>
                {activeTeam ? (
                  <span className="status-pill" style={{ borderColor: activeTeam.color }}>
                    {activeTeam.name}
                  </span>
                ) : null}
              </div>
              <div className="match-prep-mobile-picker" aria-label={t("matchPrep.mobilePicker")}>
                <div className="match-prep-mobile-picker__filters">
                  <select
                    value={categoryFilter}
                    onChange={(e) => selectCategoryFilter(e.target.value)}
                    aria-label={t("matchPrep.mobileCategory")}
                  >
                    <option value="">{t("matchPrep.allCategories")}</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedEntry?.id ?? ""}
                    onChange={(e) => setSelectedEntryId(e.target.value || null)}
                    aria-label={t("matchPrep.mobilePicker")}
                  >
                    <option value="">{t("matchPrep.noSelected")}</option>
                    {compactEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {displayEntryCode(entry)} · {entry.play?.name ?? playMap.get(entry.playId)?.name ?? t("matchPrep.unavailablePlay")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="match-prep-mobile-code-strip">
                  {compactEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`match-prep-mobile-code${selectedEntry?.id === entry.id ? " match-prep-mobile-code--active" : ""}`}
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      {displayEntryCode(entry)}
                    </button>
                  ))}
                  {compactEntries.length === 0 ? <span className="muted">{t("matchPrep.noEntriesMatched")}</span> : null}
                </div>
              </div>
              {selectedEntry?.play ? (
                <PlaybackPreviewSection document={selectedEntry.play.document} resetPlaybackKey={selectedEntry.id} rangeInputId={`match-prep-${selectedEntry.id}`} />
              ) : (
                <div className="match-prep-empty-stage">
                  <p>{selectedEntry ? t("matchPrep.saveToPreview") : t("matchPrep.addFirst")}</p>
                </div>
              )}
            </section>

            <aside className="match-prep-call-sheet card">
              <div className="match-prep-call-sheet__top">
                <p className="match-prep-kicker">{t("matchPrep.callSheet")}</p>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("matchPrep.quickSearch")} />
              </div>
              <div className="match-prep-category-tabs">
                <button type="button" className={`btn btn-sm ${!categoryFilter ? "btn-active" : ""}`} onClick={() => selectCategoryFilter("")}>
                  {t("matchPrep.allCategories")}
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`btn btn-sm ${categoryFilter === category ? "btn-active" : ""}`}
                    onClick={() => selectCategoryFilter(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="match-prep-card-grid">
                {filteredEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`match-prep-call-card${selectedEntry?.id === entry.id ? " match-prep-call-card--active" : ""}`}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <span className="match-prep-call-card__code" title={entry.category}>{displayEntryCode(entry)}</span>
                    <strong>{entry.play?.name ?? playMap.get(entry.playId)?.name ?? t("matchPrep.unavailablePlay")}</strong>
                    <small>{entry.category}</small>
                    {entry.cue ? <span>{entry.cue}</span> : null}
                  </button>
                ))}
                {filteredEntries.length === 0 ? <p className="muted">{t("matchPrep.noEntriesMatched")}</p> : null}
              </div>
            </aside>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.1rem" }}>{t("matchPrep.planInfo")}</h2>
            <div className="match-prep-form-grid">
              <div className="field">
                <label>{t("matchPrep.planTitle")}</label>
                <input value={title} onChange={(e) => { setTitle(e.target.value); markUnsaved(); }} />
              </div>
              <div className="field">
                <label>{t("matchPrep.opponent")}</label>
                <input value={opponent} onChange={(e) => { setOpponent(e.target.value); markUnsaved(); }} />
              </div>
              <div className="field">
                <label>{t("matchPrep.gameDate")}</label>
                <input type="date" value={gameDate} onChange={(e) => { setGameDate(e.target.value); markUnsaved(); }} />
              </div>
              <div className="field">
                <label>{t("matchPrep.team")}</label>
                <select value={teamId} onChange={(e) => { setTeamId(e.target.value); markUnsaved(); }}>
                  <option value="">{t("matchPrep.noTeam")}</option>
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>{t("matchPrep.notes")}</label>
              <textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); markUnsaved(); }} placeholder={t("matchPrep.notesPlaceholder")} />
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saveStatus === "saving" || !title.trim()}>
                {saveStatus === "saving" ? t("matchPrep.saving") : t("matchPrep.save")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void load()}>
                {t("matchPrep.reload")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void removePrep()}>
                {t("matchPrep.delete")}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.1rem" }}>{t("matchPrep.addTactic")}</h2>
            <div className="match-prep-entry-add">
              <div className="field">
                <label>{t("matchPrep.play")}</label>
                <select
                  value={newPlayId}
                  onChange={(e) => {
                    const nextPlayId = e.target.value;
                    const nextPlay = plays.find((play) => play.id === nextPlayId);
                    setNewPlayId(nextPlayId);
                    if (nextPlay?.category) setNewCategory(nextPlay.category);
                  }}
                >
                  <option value="">{t("matchPrep.choosePlay")}</option>
                  {playOptions.map((play) => (
                    <option key={play.id} value={play.id}>
                      {play.category ? `${play.name} · ${play.category}` : play.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t("matchPrep.code")}</label>
                <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder={t("matchPrep.codePlaceholder")} />
              </div>
              <div className="field">
                <label>{t("matchPrep.category")}</label>
                <input list="match-prep-categories" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              </div>
              <div className="field">
                <label>{t("matchPrep.cue")}</label>
                <input value={newCue} onChange={(e) => setNewCue(e.target.value)} placeholder={t("matchPrep.cuePlaceholder")} />
              </div>
              <button type="button" className="btn btn-primary" onClick={addEntry} disabled={!newPlayId || !newCode.trim() || !newCategory.trim()}>
                {t("matchPrep.addEntry")}
              </button>
            </div>
            <datalist id="match-prep-categories">
              {categoryOptions.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption} />
              ))}
            </datalist>
            {plays.length === 0 ? (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                {t("matchPrep.noPlays")} <Link to="/plays">{t("matchPrep.createPlayFirst")}</Link>
              </p>
            ) : null}
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.1rem" }}>{t("matchPrep.entryEditor")}</h2>
            <div className="match-prep-entry-editor">
              {sortedEntries.map((entry, index) => (
                <div key={entry.id} className="match-prep-entry-row">
                  <input
                    value={entry.code}
                    aria-label={t("matchPrep.code")}
                    onChange={(e) => updateEntry(entry.id, { code: e.target.value })}
                  />
                  <input
                    list="match-prep-categories"
                    value={entry.category}
                    aria-label={t("matchPrep.category")}
                    onChange={(e) => updateEntry(entry.id, { category: e.target.value })}
                  />
                  <select
                    value={entry.playId}
                    aria-label={t("matchPrep.play")}
                    onChange={(e) => {
                      const nextPlayId = e.target.value;
                      const nextPlay = plays.find((play) => play.id === nextPlayId);
                      updateEntry(entry.id, {
                        playId: nextPlayId,
                        ...(nextPlay?.category ? { category: nextPlay.category } : {}),
                      });
                    }}
                  >
                    {plays.map((play) => (
                      <option key={play.id} value={play.id}>
                        {play.category ? `${play.name} · ${play.category}` : play.name}
                      </option>
                    ))}
                    {!plays.some((play) => play.id === entry.playId) ? (
                      <option value={entry.playId}>{entry.play?.name ?? t("matchPrep.unavailablePlay")}</option>
                    ) : null}
                  </select>
                  <input
                    value={entry.cue ?? ""}
                    aria-label={t("matchPrep.cue")}
                    onChange={(e) => updateEntry(entry.id, { cue: e.target.value })}
                    placeholder={t("matchPrep.cuePlaceholder")}
                  />
                  <div className="row-actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveEntry(entry.id, -1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => moveEntry(entry.id, 1)} disabled={index === sortedEntries.length - 1}>
                      ↓
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeEntry(entry.id)}>
                      {t("teams.removePlayer")}
                    </button>
                  </div>
                </div>
              ))}
              {sortedEntries.length === 0 ? <p className="muted">{t("matchPrep.noEntries")}</p> : null}
            </div>
            <p className="muted" style={{ margin: "0.75rem 0 0" }}>
              {t("matchPrep.saveAfterEdit")}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MatchPrepsPage() {
  const { id } = useParams();
  return id ? <MatchPrepDetailPage prepId={id} /> : <MatchPrepListPage />;
}
