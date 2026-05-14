import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { tryParseTacticDocumentV1, type TacticDocumentV1 } from "@volleyball/shared";
import { TacticEditor } from "../tactic/TacticEditor";
import { PlayPreview } from "../tactic/PlayPreview";
import { TemplateLibrary } from "../tactic/TemplateLibrary";
import { playbackEndMs } from "../tactic/viewer-math";
import { courtModeFromDocument, type CourtMode } from "../tactic/court-geometry";
import {
  cleanTacticCategory,
  TACTIC_CATEGORY_KEYS,
  uniqueCategoryOptions,
  withDocumentCategory,
} from "../tactic/categories";

type Play = {
  id: string;
  name: string;
  description: string | null;
  category?: string;
  tags: string[];
  teamId: string | null;
  teamIds: string[];
  document: TacticDocumentV1;
  libraryScope: "all_coaches" | "partial" | "hidden";
  sharedWithUserIds: string[];
  updatedAt: string;
};

type TeamPlayer = { id: string; name: string; number: number };
type Team = { id: string; name: string; color: string; players: TeamPlayer[] };
type Account = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
};
type PlayShare = { shareId: string; token: string; viewUrl: string; expiresAt: string | null; createdAt: string };

type SaveStatus = "saved" | "saving" | "unsaved";
type SavePayload = {
  name: string;
  description: string;
  category: string;
  assignedTeamIds: string[];
  libraryScope: "all_coaches" | "partial" | "hidden";
  sharedWithUserIds: string[];
  doc: TacticDocumentV1;
};

function snapshotSavePayload(payload: SavePayload) {
  return JSON.stringify(payload);
}

export function PlayEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [rosterTeamId, setRosterTeamId] = useState("");
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tacticCategories, setTacticCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [doc, setDoc] = useState<TacticDocumentV1 | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [teachingMode, setTeachingMode] = useState(false);
  const [tMs, setTms] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [frameByFrame, setFrameByFrame] = useState(false);
  const [frameStepTarget, setFrameStepTarget] = useState<{ from: number; to: number } | null>(null);
  const [loop, setLoop] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2>(1);
  const [libraryScope, setLibraryScope] = useState<"all_coaches" | "partial" | "hidden">("hidden");
  const [sharedWithUserIds, setSharedWithUserIds] = useState<string[]>([]);
  const defaultCategories = useMemo(() => TACTIC_CATEGORY_KEYS.map((key) => t(key)), [t]);
  const categoryOptions = useMemo(
    () => uniqueCategoryOptions([...defaultCategories, ...tacticCategories, category, doc?.meta.category]),
    [category, defaultCategories, tacticCategories, doc],
  );

  const savePayload = useMemo<SavePayload | null>(
    () =>
      doc
        ? {
            name,
            description,
            category,
            assignedTeamIds,
            libraryScope,
            sharedWithUserIds,
            doc,
          }
        : null,
    [name, description, category, assignedTeamIds, libraryScope, sharedWithUserIds, doc],
  );
  const currentSnapshot = useMemo(
    () => (savePayload ? snapshotSavePayload(savePayload) : ""),
    [savePayload],
  );

  const savedSnapshotRef = useRef<string>("");
  const currentSnapshotRef = useRef("");
  currentSnapshotRef.current = currentSnapshot;
  const savePayloadRef = useRef<SavePayload | null>(null);
  savePayloadRef.current = savePayload;
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const categoryInputRef = useRef<HTMLInputElement | null>(null);
  const tMsRef = useRef(0);
  tMsRef.current = tMs;
  const speedRef = useRef(playbackSpeed);
  speedRef.current = playbackSpeed;
  const frameStepTargetRef = useRef(frameStepTarget);
  frameStepTargetRef.current = frameStepTarget;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<TacticDocumentV1[]>([]);
  const redoStackRef = useRef<TacticDocumentV1[]>([]);
  const lastUndoPushAtRef = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const isDirty = useCallback(() => {
    return Boolean(doc) && currentSnapshot !== savedSnapshotRef.current;
  }, [doc, currentSnapshot]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const syncJsonText = useCallback(
    (nextDoc: TacticDocumentV1) => {
      if (showJson) setJsonText(JSON.stringify(nextDoc, null, 2));
    },
    [showJson],
  );

  const pushUndoSnapshot = useCallback((snapshot: TacticDocumentV1) => {
    const now = performance.now();
    if (undoStackRef.current.length === 0 || now - lastUndoPushAtRef.current > 500) {
      undoStackRef.current.push(snapshot);
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      lastUndoPushAtRef.current = now;
      setHistoryVersion((v) => v + 1);
    }
    redoStackRef.current = [];
  }, []);

  const restoreDoc = useCallback(
    (nextDoc: TacticDocumentV1) => {
      setDoc(nextDoc);
      syncJsonText(nextDoc);
      setSaveStatus("unsaved");
      setHistoryVersion((v) => v + 1);
    },
    [syncJsonText],
  );

  const undo = useCallback(() => {
    if (!doc || undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push(doc);
    restoreDoc(prev);
  }, [doc, restoreDoc]);

  const redo = useCallback(() => {
    if (!doc || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(doc);
    restoreDoc(next);
  }, [doc, restoreDoc]);

  const handleActiveTimeChange = useCallback((nextT: number) => {
    setPlaying(false);
    setFrameStepTarget(null);
    setTms(nextT);
  }, []);

  const handleCategoryChange = useCallback(
    (value: string) => {
      const nextCategory = value.slice(0, 64);
      setCategory(nextCategory);
      setDoc((prev) => {
        if (!prev) return prev;
        const nextDoc = withDocumentCategory(prev, nextCategory);
        syncJsonText(nextDoc);
        return nextDoc;
      });
      setSaveStatus("unsaved");
    },
    [syncJsonText],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const doSave = useCallback(async () => {
    if (!id) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    const payload = savePayloadRef.current;
    if (!payload) return;
    const payloadSnapshot = snapshotSavePayload(payload);
    const nextCategory = cleanTacticCategory(payload.category);
    const nextDoc = withDocumentCategory(payload.doc, nextCategory);
    const savedSnapshot = snapshotSavePayload({
      ...payload,
      category: nextCategory,
      doc: nextDoc,
    });
    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setErr(null);
    try {
      await api<Play>(`/api/v1/plays/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          category: nextCategory,
          teamId: payload.assignedTeamIds[0] ?? null,
          teamIds: payload.assignedTeamIds,
          libraryScope: payload.libraryScope,
          sharedWithUserIds:
            payload.libraryScope === "partial" ? payload.sharedWithUserIds : [],
          document: nextDoc,
        }),
      });
      if (currentSnapshotRef.current === payloadSnapshot) {
        setCategory(nextCategory);
        setDoc(nextDoc);
        syncJsonText(nextDoc);
        savedSnapshotRef.current = savedSnapshot;
        saveQueuedRef.current = false;
        setSaveStatus("saved");
      } else if (savedSnapshotRef.current !== currentSnapshotRef.current) {
        saveQueuedRef.current = true;
        setSaveStatus("unsaved");
      } else {
        setSaveStatus("saved");
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("edit.saveFailed"));
      setSaveStatus("unsaved");
    } finally {
      saveInFlightRef.current = false;
      if (saveQueuedRef.current && savedSnapshotRef.current !== currentSnapshotRef.current) {
        saveQueuedRef.current = false;
        void doSave();
      }
    }
  }, [id, syncJsonText, t]);

  useEffect(() => {
    if (!doc || saveStatus === "saved" || saveStatus === "saving") return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void doSave();
    }, 3000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [doc, currentSnapshot, saveStatus, doSave]);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const p = await api<Play>(`/api/v1/plays/${id}`);
      const shares = await api<PlayShare[]>(`/api/v1/plays/${id}/shares`);
      setName(p.name);
      setDescription(p.description ?? "");
      const nextCategory = cleanTacticCategory(p.category ?? p.document.meta.category);
      setCategory(nextCategory);
      const nextAssignedTeamIds = p.teamIds?.length ? p.teamIds : p.teamId ? [p.teamId] : [];
      setAssignedTeamIds(nextAssignedTeamIds);
      const nextLibraryScope = p.libraryScope ?? "all_coaches";
      const nextSharedWithUserIds = p.sharedWithUserIds ?? [];
      setLibraryScope(nextLibraryScope);
      setSharedWithUserIds(nextLibraryScope === "partial" ? nextSharedWithUserIds : []);
      setRosterTeamId("");
      const nextDoc = withDocumentCategory(p.document, nextCategory);
      setDoc(nextDoc);
      setJsonText(JSON.stringify(nextDoc, null, 2));
      undoStackRef.current = [];
      redoStackRef.current = [];
      setHistoryVersion((v) => v + 1);
      setTms(0);
      savedSnapshotRef.current = JSON.stringify({
        name: p.name,
        description: p.description ?? "",
        category: nextCategory,
        assignedTeamIds: nextAssignedTeamIds,
        libraryScope: nextLibraryScope,
        sharedWithUserIds: nextLibraryScope === "partial" ? nextSharedWithUserIds : [],
        doc: nextDoc,
      });
      setViewUrl(shares[0]?.viewUrl ?? null);
      setSaveStatus("saved");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("edit.loadFailed"));
    }
  }, [id, t]);

  const loadTeams = useCallback(async () => {
    try {
      const res = await api<Team[]>("/api/v1/teams");
      setTeams(res);
    } catch {
      /* Editing still works without team data. */
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api<{ items: string[] }>("/api/v1/tactic-categories");
      setTacticCategories(res.items);
    } catch {
      /* Category defaults and the current play category remain available. */
    }
  }, []);

  const handleCourtModeChange = useCallback((mode: CourtMode) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        meta: {
          ...prev.meta,
          court: { ...prev.meta.court, preset: mode },
        },
      };
    });
    setSaveStatus("unsaved");
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api<Account[]>("/api/v1/accounts?pageSize=50");
      setAccounts(res);
    } catch {
      /* Sharing can still be set to all/hidden without account data. */
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadTeams();
      void loadCategories();
      void loadAccounts();
      void load();
    }
  }, [user, load, loadTeams, loadCategories, loadAccounts]);

  const startRef = useRef(0);
  useEffect(() => {
    if (frameByFrame) setPlaying(false);
  }, [frameByFrame]);

  useEffect(() => {
    if (!frameByFrame) setFrameStepTarget(null);
  }, [frameByFrame]);

  // Frame-by-frame: play sim time from `from` to `to` (same speed rules as full playback, then stop)
  useEffect(() => {
    if (!doc || !frameStepTarget) return;
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
  }, [doc, frameStepTarget]);

  useEffect(() => {
    if (!doc || !playing || frameByFrame) return;
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
    if (!doc) return [];
    const endT = playbackEndMs(doc);
    const stops = [...new Set([0, ...doc.keyframes.map((k) => k.t), endT])]
      .filter((tm) => tm >= 0 && tm <= endT)
      .sort((a, b) => a - b);
    return stops;
  }, [doc]);

  const startFrameStep = useCallback(() => {
    if (!doc || frameStepTargetRef.current) return;
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
    // Past the last leg: jump to the beginning, then play forward to the next stop (not backwards wrap)
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

  if (!user) return <Navigate to="/login" replace />;
  if (!id) return <p className="error">{t("edit.missingId")}</p>;

  function handleDocChange(newDoc: TacticDocumentV1) {
    if (doc) pushUndoSnapshot(doc);
    const nextDoc = withDocumentCategory(newDoc, category);
    setDoc(nextDoc);
    syncJsonText(nextDoc);
    setSaveStatus("unsaved");
  }

  function applyLocalJson() {
    setErr(null);
    try {
      const parsed = tryParseTacticDocumentV1(JSON.parse(jsonText));
      if (!parsed.success) {
        setErr(parsed.error.issues[0]?.message ?? t("edit.jsonInvalid"));
        return;
      }
      if (doc) pushUndoSnapshot(doc);
      const nextCategory = cleanTacticCategory(parsed.data.meta.category || category);
      const nextDoc = withDocumentCategory(parsed.data, nextCategory);
      setCategory(nextCategory);
      setDoc(nextDoc);
      setJsonText(JSON.stringify(nextDoc, null, 2));
      setSaveStatus("unsaved");
    } catch {
      setErr(t("edit.jsonInvalid"));
    }
  }

  async function del() {
    if (!confirm(t("edit.confirmDelete"))) return;
    setErr(null);
    try {
      await api(`/api/v1/plays/${id}`, { method: "DELETE" });
      nav("/plays", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("edit.deleteFailed"));
    }
  }

  async function duplicate() {
    setErr(null);
    try {
      const res = await api<{ id: string }>(`/api/v1/plays/${id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ name: `${name}${t("edit.copySuffix")}` }),
      });
      nav(`/plays/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("edit.duplicateFailed"));
    }
  }

  async function share() {
    setErr(null);
    try {
      const existing = await api<PlayShare[]>(`/api/v1/plays/${id}/shares`);
      if (existing[0]) {
        setViewUrl(existing[0].viewUrl);
        return;
      }
      const s = await api<{ viewUrl: string }>(`/api/v1/plays/${id}/shares`, {
        method: "POST",
        body: "{}",
      });
      setViewUrl(s.viewUrl);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("edit.shareFailed"));
    }
  }

  async function saveThenShare() {
    await doSave();
    await share();
  }

  function enterTeachingMode() {
    setShowJson(false);
    setShowTemplates(false);
    setTeachingMode(true);
  }

  const duration = doc?.meta?.durationMs ?? 8000;
  const effectiveEnd = doc ? playbackEndMs(doc) : duration;
  const statusLabel = {
    saved: t("edit.statusSaved"),
    saving: t("edit.statusSaving"),
    unsaved: t("edit.statusUnsaved"),
  }[saveStatus];
  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;
  const selectedRosterTeam = rosterTeamId ? teams.find((tm) => tm.id === rosterTeamId) : undefined;
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

  return (
    <div className={teachingMode ? "play-edit play-edit--teaching" : "play-edit"}>
      <p style={{ margin: "0 0 0.5rem" }}>
        <Link to="/plays" className="muted">
          {t("edit.back")}
        </Link>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>{t("edit.title")}</h1>
        <span className={`save-status save-status--${saveStatus}`}>{statusLabel}</span>
      </div>
      {err ? <p className="error">{err}</p> : null}
      {viewUrl && !teachingMode ? (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {t("edit.viewHint")}
          </p>
          <a href={viewUrl} target="_blank" rel="noreferrer">
            {viewUrl}
          </a>
        </div>
      ) : null}
      <div className="row-actions" style={{ marginBottom: "1rem" }}>
        {teachingMode ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => void saveThenShare()}>
              {t("edit.shareForTeaching")}
            </button>
            {viewUrl ? (
              <a href={viewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                {t("edit.openStudentView")}
              </a>
            ) : null}
            <button type="button" className="btn" onClick={() => setTeachingMode(false)}>
              {t("edit.exitTeachingMode")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={() => void doSave()}>
              {t("edit.save")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canUndo}
              onClick={undo}
              title="⌘Z / Ctrl+Z"
            >
              {t("edit.undo")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canRedo}
              onClick={redo}
              title="⌘⇧Z / Ctrl+Y"
            >
              {t("edit.redo")}
            </button>
            <button type="button" className="btn" onClick={() => void duplicate()}>
              {t("edit.duplicate")}
            </button>
            <button type="button" className="btn" onClick={() => void share()}>
              {t("edit.share")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={enterTeachingMode}>
              {t("edit.teachingMode")}
            </button>
            <button type="button" className="btn" onClick={() => void del()}>
              {t("edit.delete")}
            </button>
          </>
        )}
      </div>

      {teachingMode ? (
        <section className="teaching-mode-panel card">
          <div>
            <p className="home-kicker">{t("edit.teachingMode")}</p>
            <h2>{name || t("edit.title")}</h2>
            <p className="hint">{description || t("edit.teachingModeBody")}</p>
          </div>
          <div className="teaching-mode-panel__meta">
            {category ? <span className="status-pill">{category}</span> : null}
            <span className="status-pill">{statusLabel}</span>
            {viewUrl ? (
              <a href={viewUrl} target="_blank" rel="noreferrer">
                {t("edit.teachingShareReady")}
              </a>
            ) : (
              <span className="muted">{t("edit.teachingHint")}</span>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="field">
            <label htmlFor="n">{t("edit.name")}</label>
            <input
              id="n"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaveStatus("unsaved");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="playCategory">{t("edit.tacticCategory")}</label>
            <div
              className="category-combobox"
              onClick={() => categoryInputRef.current?.focus()}
            >
              <input
                ref={categoryInputRef}
                id="playCategory"
                list="play-category-options"
                value={category}
                maxLength={64}
                placeholder={t("edit.tacticCategoryPlaceholder")}
                onChange={(e) => handleCategoryChange(e.target.value)}
              />
              <span className="category-combobox__chevron" aria-hidden="true">⌄</span>
            </div>
            <datalist id="play-category-options">
              {categoryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {t("edit.tacticCategoryHint")}
            </p>
          </div>
          <div className="field">
            <label htmlFor="d">{t("edit.description")}</label>
            <textarea
              id="d"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSaveStatus("unsaved");
              }}
            />
          </div>
          <div className="field">
            <label>{t("edit.librarySharing")}</label>
            <div className="team-checkbox-grid">
              {(["all_coaches", "hidden", "partial"] as const).map((scope) => (
                <label key={scope} className="team-checkbox">
                  <input
                    type="radio"
                    name="libraryScope"
                    checked={libraryScope === scope}
                    onChange={() => {
                      setLibraryScope(scope);
                      if (scope !== "partial") setSharedWithUserIds([]);
                      setSaveStatus("unsaved");
                    }}
                  />
                  {t(`edit.libraryScope.${scope}`)}
                </label>
              ))}
            </div>
            <p className="muted" style={{ margin: "0.35rem 0 0" }}>
              {libraryScope === "all_coaches"
                ? t("edit.libraryVisibleAll")
                : libraryScope === "hidden"
                  ? t("edit.libraryHidden")
                  : t("edit.libraryPartialHint")}
            </p>
          </div>
          {libraryScope === "partial" ? (
            <div className="field">
              <label>{t("edit.sharedAccounts")}</label>
              <div className="team-checkbox-grid">
                {accounts
                  .filter((account) => account.id !== user.id)
                  .map((account) => {
                    const checked = sharedWithUserIds.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className="team-checkbox"
                        style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSharedWithUserIds((ids) =>
                              e.target.checked ? [...ids, account.id] : ids.filter((id) => id !== account.id),
                            );
                            setSaveStatus("unsaved");
                          }}
                        />
                        {account.avatarUrl ? (
                          <img
                            src={account.avatarUrl}
                            alt=""
                            className="avatar-thumb"
                            width={28}
                            height={28}
                            style={{ width: 28, height: 28 }}
                          />
                        ) : null}
                        <span>{account.name || account.email}</span>
                      </label>
                    );
                  })}
              </div>
              {accounts.filter((account) => account.id !== user.id).length === 0 ? (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {t("edit.noShareAccounts")}
                </p>
              ) : null}
            </div>
          ) : null}
          {teams.length > 0 ? (
            <>
              <div className="field">
                <label htmlFor="rosterTeam">{t("edit.rosterTeam")}</label>
                <select
                  id="rosterTeam"
                  value={rosterTeamId}
                  onChange={(e) => setRosterTeamId(e.target.value)}
                >
                  <option value="">{t("edit.defaultRoster")}</option>
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t("edit.assignedTeams")}</label>
                <div className="team-checkbox-grid">
                  {teams.map((tm) => {
                    const checked = assignedTeamIds.includes(tm.id);
                    return (
                      <label key={tm.id} className="team-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setAssignedTeamIds((ids) =>
                              e.target.checked ? [...ids, tm.id] : ids.filter((id) => id !== tm.id),
                            );
                            setSaveStatus("unsaved");
                          }}
                        />
                        <span style={{ background: tm.color }} />
                        {tm.name}
                      </label>
                    );
                  })}
                </div>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {assignedTeamIds.length === 0 ? t("edit.assignedAllTeamsHint") : t("edit.assignedTeamsHint")}
                </p>
              </div>
            </>
          ) : null}
        </>
      )}

      {doc && !teachingMode ? (
        <TacticEditor
          document={doc}
          onChange={handleDocChange}
          onOpenTemplates={() => setShowTemplates(true)}
          courtMode={courtModeFromDocument(doc)}
          onCourtModeChange={handleCourtModeChange}
          onActiveTimeChange={handleActiveTimeChange}
          teamPlayers={selectedRosterTeam?.players ?? []}
        />
      ) : null}

      {doc ? (
        <div className={teachingMode ? "card teaching-preview-card" : "card"} style={{ marginTop: "1rem" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
            {teachingMode ? t("edit.teachingPreview") : t("edit.preview")}
          </h2>
          {teachingMode ? <p className="hint">{t("edit.teachingModeBody")}</p> : null}
          <PlayPreview document={doc} tMs={tMs} courtMode={courtModeFromDocument(doc)} />
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
                      >
                        <span className="preview-controls__mark-label">{i + 1}</span>
                      </button>
                    );
                  })}
                </div>
                <input
                  id="range"
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
                  {frameByFrame
                    ? t("edit.play")
                    : playing
                      ? t("edit.pause")
                      : t("edit.play")}
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
                    onChange={(e) => {
                      setFrameByFrame(e.target.checked);
                    }}
                  />
                  <span>{t("edit.frameByFrame")}</span>
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
                <span>{t("edit.speed")}</span>
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
        </div>
      ) : null}

      {!teachingMode ? (
      <details
        style={{ marginTop: "1rem" }}
        open={showJson}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setShowJson(open);
          if (open && doc) setJsonText(JSON.stringify(doc, null, 2));
        }}
      >
        <summary className="muted" style={{ cursor: "pointer" }}>{t("edit.jsonTitle")}</summary>
        <div className="field" style={{ marginTop: "0.5rem" }}>
          <textarea
            rows={12}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          <p style={{ margin: "0.4rem 0 0" }}>
            <button type="button" className="btn btn-ghost" onClick={applyLocalJson}>
              {t("edit.applyJson")}
            </button>
          </p>
        </div>
      </details>
      ) : null}

      {showTemplates && doc && !teachingMode ? (
        <TemplateLibrary
          confirmBeforeSelect={!!doc}
          onSelect={(tmpl) => {
            handleDocChange(tmpl);
            setShowTemplates(false);
          }}
          onClose={() => setShowTemplates(false)}
        />
      ) : null}
    </div>
  );
}
