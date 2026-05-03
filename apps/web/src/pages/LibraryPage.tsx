import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import type { TacticDocumentV1 } from "@volleyball/shared";
import { tryParseTacticDocumentV1 } from "@volleyball/shared";
import { PlaybackPreviewSection } from "../tactic/PlaybackPreviewSection";
import { courtModeFromDocument } from "../tactic/court-geometry";
import { TEMPLATES, type Template } from "../tactic/templates";

type LibraryListItem = {
  id: string;
  name: string;
  description: string | null;
  category?: string;
  tags: string[];
  userId: string;
  author: { name: string; email: string; avatarUrl?: string | null };
  updatedAt: string;
};

function playIdSuffix(id: string) {
  const hex = id.replace(/-/g, "");
  return hex.length >= 8 ? hex.slice(-8) : id.slice(0, 8);
}

function builtInMatchesQuery(template: Template, q: string, t: (key: string) => string) {
  const query = q.trim().toLocaleLowerCase();
  if (!query) return true;
  const haystack = [
    t(template.nameKey),
    t(template.descKey),
    template.document.meta.name ?? "",
    template.document.meta.description ?? "",
    ...(template.document.meta.tags ?? []),
  ].join(" ").toLocaleLowerCase();
  return haystack.includes(query);
}

type LibraryDetail = {
  id: string;
  name: string;
  category?: string;
  document: TacticDocumentV1;
  isOwner: boolean;
  author: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
    bio?: string | null;
  };
  updatedAt: string;
};

function LibraryList() {
  const { t } = useT();
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryListItem[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<"builtin" | "user">("builtin");
  const builtIns = useMemo(
    () => TEMPLATES.filter((tmpl) => builtInMatchesQuery(tmpl, q, t)),
    [q, t],
  );

  const load = useCallback(async () => {
    setErr(null);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("pageSize", "100");
    try {
      const res = await api<{ items: LibraryListItem[] }>(`/api/v1/plays/library?${qs.toString()}`);
      setItems(res.items);
    } catch {
      setErr(t("lib.loadFailed"));
    }
  }, [q, t]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("lib.title")}</h1>
      <p className="hint">{t("lib.hint")}</p>
      {err ? <p className="error">{err}</p> : null}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="search"
          className="btn"
          style={{ minWidth: 200, textAlign: "left" }}
          placeholder={t("lib.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <button type="button" className="btn" onClick={() => void load()}>
          {t("lib.search")}
        </button>
      </div>

      <div className="row-actions" role="tablist" aria-label={t("lib.title")} style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={activePage === "builtin"}
          className={activePage === "builtin" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setActivePage("builtin")}
        >
          {t("lib.builtinTitle")} ({builtIns.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePage === "user"}
          className={activePage === "user" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setActivePage("user")}
        >
          {t("lib.userTitle")} ({items.length})
        </button>
      </div>

      {activePage === "builtin" ? (
        <div className="list" role="tabpanel">
          {builtIns.map((tmpl) => (
            <Link key={tmpl.id} to={`/library/builtin/${tmpl.id}`} className="list-item list-item--link">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span className="list-item__title">{t(tmpl.nameKey)}</span>
                  <span className="status-pill">{t("lib.builtinBadge")}</span>
                </h3>
                <p className="muted">
                  {t(tmpl.descKey)}
                  {tmpl.document.meta.tags?.length
                    ? ` · ${tmpl.document.meta.tags.slice(0, 4).join(", ")}${tmpl.document.meta.tags.length > 4 ? "…" : ""}`
                    : null}
                </p>
              </div>
            </Link>
          ))}
          {builtIns.length === 0 ? <p className="muted">{t("lib.builtinEmpty")}</p> : null}
        </div>
      ) : (
        <div className="list" role="tabpanel">
          {items.map((p) => (
            <Link key={p.id} to={`/library/${p.id}`} className="list-item list-item--link">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  {p.author.avatarUrl ? (
                    <img src={p.author.avatarUrl} alt="" className="avatar-thumb" width={36} height={36} />
                  ) : null}
                  <span className="list-item__title">{p.name}</span>
                  {p.category ? <span className="status-pill">{p.category}</span> : null}
                  {p.userId === user.id ? <span className="status-pill">{t("lib.mine")}</span> : null}
                </h3>
                <p className="muted">
                  {t("lib.by")} {p.author.name}
                  {p.author.email && p.author.email !== p.author.name ? ` · ${p.author.email}` : null}
                  {" "}
                  · #{playIdSuffix(p.id)}
                  {p.tags.length ? ` · ${p.tags.slice(0, 4).join(", ")}${p.tags.length > 4 ? "…" : ""}` : null}
                  {" "}
                  · {t("plays.updatedAt")} {new Date(p.updatedAt).toLocaleString()}
                </p>
              </div>
            </Link>
          ))}
          {items.length === 0 && !err ? <p className="muted">{t("lib.empty")}</p> : null}
        </div>
      )}
      {builtIns.length > 0 || items.length > 0 ? (
        <p className="hint" style={{ marginTop: "1rem" }}>
          {t("lib.hintEnd")}
        </p>
      ) : null}
    </div>
  );
}

function BuiltinLibraryDetail({ templateId }: { templateId: string }) {
  const { t } = useT();
  const nav = useNavigate();
  const { user } = useAuth();
  const [copying, setCopying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const template = TEMPLATES.find((tmpl) => tmpl.id === templateId);

  if (!user) return <Navigate to="/login" replace />;
  if (!template) {
    return (
      <div>
        <p style={{ margin: "0 0 0.5rem" }}>
          <Link to="/library" className="muted">
            {t("lib.back")}
          </Link>
        </p>
        <p className="error">{t("lib.invalidDoc")}</p>
      </div>
    );
  }

  const tmpl = template;
  const doc = tmpl.document;

  async function copy() {
    setCopying(true);
    setErr(null);
    try {
      const document = structuredClone(doc);
      document.meta = {
        ...document.meta,
        name: t(tmpl.nameKey),
        description: t(tmpl.descKey),
      };
      const res = await api<{ id: string }>("/api/v1/plays", {
        method: "POST",
        body: JSON.stringify({
          name: t(tmpl.nameKey),
          description: t(tmpl.descKey),
          category: document.meta.category ?? "",
          tags: document.meta.tags ?? [],
          document,
          teamIds: [] as string[],
        }),
      });
      nav(`/plays/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("lib.copyFailed"));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <Link to="/library" className="muted">
          {t("lib.back")}
        </Link>
      </p>
      {err ? <p className="error">{err}</p> : null}
      <div style={{ marginBottom: "0.5rem" }}>
        <h1 style={{ margin: "0 0 0.35rem" }}>{t(tmpl.nameKey)}</h1>
        <p className="hint" style={{ margin: 0 }}>
          {t("lib.builtinBadge")}
          {doc.meta.tags?.length ? ` · ${doc.meta.tags.join(", ")}` : null}
        </p>
        <p className="muted" style={{ margin: "0.5rem 0 0" }}>
          {t(tmpl.descKey)}
        </p>
      </div>
      <div className="row-actions" style={{ margin: "0.75rem 0" }}>
        <button type="button" className="btn btn-primary" onClick={() => void copy()} disabled={copying}>
          {copying ? t("lib.copying") : t("lib.copyToMine")}
        </button>
      </div>
      <p className="muted" style={{ margin: "0 0 0.75rem" }}>
        {t("bench.court")}: {courtModeFromDocument(doc) === "full" ? t("bench.full") : t("bench.half")}
      </p>
      <PlaybackPreviewSection document={doc} resetPlaybackKey={`builtin-${tmpl.id}`} rangeInputId="builtin-playback-range" />
    </div>
  );
}

function LibraryDetail({ playId }: { playId: string }) {
  const { t } = useT();
  const nav = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<LibraryDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    setRow(null);
    setErr(null);
    (async () => {
      try {
        const p = await api<LibraryDetail>(`/api/v1/plays/library/${playId}`);
        setRow(p);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : t("lib.loadFailed"));
      }
    })();
  }, [playId, t]);

  const doc = useMemo(() => {
    if (!row) return null;
    const r = tryParseTacticDocumentV1(row.document);
    return r.success ? r.data : null;
  }, [row]);

  async function copy() {
    setCopying(true);
    setErr(null);
    try {
      const res = await api<{ id: string }>(`/api/v1/plays/library/${playId}/duplicate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      nav(`/plays/${res.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("lib.copyFailed"));
    } finally {
      setCopying(false);
    }
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div>
      <p style={{ margin: "0 0 0.5rem" }}>
        <Link to="/library" className="muted">
          {t("lib.back")}
        </Link>
      </p>
      {err ? <p className="error">{err}</p> : null}
      {row && doc ? (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
            {row.author.avatarUrl ? (
              <img
                src={row.author.avatarUrl}
                alt=""
                className="avatar-thumb"
                width={48}
                height={48}
                style={{ width: 48, height: 48 }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: "0 0 0.35rem" }}>{row.name}</h1>
              <p className="hint" style={{ margin: 0 }}>
                {t("lib.by")} {row.author.name ?? row.author.email}
                {row.author.name && row.author.email && row.author.name !== row.author.email
                  ? ` · ${row.author.email}`
                  : null}
                {" "}
                · #{playIdSuffix(row.id)}
                {row.isOwner ? ` · ${t("lib.mine")}` : null}
              </p>
              {row.category ? (
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {t("edit.tacticCategory")}: {row.category}
                </p>
              ) : null}
              {row.author.bio ? (
                <p className="muted" style={{ margin: "0.5rem 0 0", whiteSpace: "pre-wrap" }}>
                  {row.author.bio}
                </p>
              ) : null}
            </div>
          </div>
          <div className="row-actions" style={{ margin: "0.75rem 0" }}>
            <button type="button" className="btn btn-primary" onClick={() => void copy()} disabled={copying}>
              {copying ? t("lib.copying") : t("lib.copyToMine")}
            </button>
            {row.isOwner ? (
              <Link to={`/plays/${row.id}`} className="btn">
                {t("lib.openMine")}
              </Link>
            ) : null}
          </div>
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>
            {t("bench.court")}: {courtModeFromDocument(doc) === "full" ? t("bench.full") : t("bench.half")}
          </p>
          <PlaybackPreviewSection document={doc} resetPlaybackKey={playId} rangeInputId="lib-playback-range" />
        </>
      ) : !err && row === null ? (
        <p className="hint">{t("view.loading")}</p>
      ) : row && !doc ? (
        <p className="error">{t("lib.invalidDoc")}</p>
      ) : null}
    </div>
  );
}

export function LibraryPage() {
  const { id } = useParams();
  const location = useLocation();
  if (id && location.pathname.startsWith("/library/builtin/")) {
    return <BuiltinLibraryDetail templateId={id} />;
  }
  if (id) {
    return <LibraryDetail playId={id} />;
  }
  return <LibraryList />;
}
