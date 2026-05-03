import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

type AdminStatus = {
  users: number;
  admins: number;
  teams: number;
  activePlays: number;
  deletedPlays: number;
  shares: number;
  activeSessions: number;
  inviteCodes: number;
  usedInviteCodes: number;
  recentUsers: AdminUser[];
};

type InviteCode = {
  id: string;
  code: string;
  createdBy: string;
  usedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  usedAt: string | null;
};

type AdminPlayRow = {
  id: string;
  name: string;
  category?: string;
  userId: string;
  author: { name: string; email: string };
  libraryScope: "all_coaches" | "partial" | "hidden";
  updatedAt: string;
};

function isAdmin(role: string) {
  return role === "admin" || role === "org_admin";
}

function formatTime(v: string | null) {
  return v ? new Date(v).toLocaleString() : "-";
}

export function AdminPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [playsLib, setPlaysLib] = useState<AdminPlayRow[]>([]);
  const [playsLibLoading, setPlaysLibLoading] = useState(false);
  const [updatingPlayId, setUpdatingPlayId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const [nextStatus, nextCodes, nextUsers] = await Promise.all([
        api<AdminStatus>("/api/v1/admin/status"),
        api<InviteCode[]>("/api/v1/admin/invite-codes"),
        api<AdminUser[]>("/api/v1/admin/users"),
      ]);
      setStatus(nextStatus);
      setCodes(nextCodes);
      setUsers(nextUsers);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("admin.loadFailed"));
    }
  }

  async function loadPlaysLib() {
    setPlaysLibLoading(true);
    setErr(null);
    try {
      const res = await api<{ items: AdminPlayRow[] }>("/api/v1/admin/plays?pageSize=200");
      setPlaysLib(res.items);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("admin.loadFailed"));
    } finally {
      setPlaysLibLoading(false);
    }
  }

  useEffect(() => {
    if (user && isAdmin(user.role)) {
      void load();
      void loadPlaysLib();
    }
  }, [user]);

  if (loading) return <p className="hint">{t("view.loading")}</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin(user.role)) return <p className="error">{t("admin.forbidden")}</p>;

  async function createInvite() {
    setCreating(true);
    setErr(null);
    setOk(null);
    try {
      const code = await api<InviteCode>("/api/v1/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNewCode(code.code);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("admin.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function setPlayLibraryScope(playId: string, libraryScope: AdminPlayRow["libraryScope"]) {
    setUpdatingPlayId(playId);
    setErr(null);
    setOk(null);
    try {
      await api<{ id: string; libraryScope: string }>(`/api/v1/admin/plays/${playId}/library`, {
        method: "PATCH",
        body: JSON.stringify({ libraryScope }),
      });
      setPlaysLib((prev) =>
        prev.map((p) => (p.id === playId ? { ...p, libraryScope, updatedAt: new Date().toISOString() } : p)),
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("admin.setScopeFailed"));
    } finally {
      setUpdatingPlayId(null);
    }
  }

  async function resetPassword(target: AdminUser) {
    const password = passwords[target.id]?.trim() ?? "";
    if (password.length < 8) {
      setErr(t("admin.passwordTooShort"));
      setOk(null);
      return;
    }
    setResettingUserId(target.id);
    setErr(null);
    setOk(null);
    try {
      await api<{ ok: true }>(`/api/v1/admin/users/${target.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      setPasswords((prev) => ({ ...prev, [target.id]: "" }));
      setOk(`${target.email} ${t("admin.passwordResetDone")}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("admin.passwordResetFailed"));
    } finally {
      setResettingUserId(null);
    }
  }

  const stats = status
    ? [
        [t("admin.users"), status.users],
        [t("admin.admins"), status.admins],
        [t("admin.teams"), status.teams],
        [t("admin.activePlays"), status.activePlays],
        [t("admin.deletedPlays"), status.deletedPlays],
        [t("admin.shares"), status.shares],
        [t("admin.sessions"), status.activeSessions],
        [t("admin.invites"), `${status.usedInviteCodes}/${status.inviteCodes}`],
      ]
    : [];

  return (
    <div>
      <h1>{t("admin.title")}</h1>
      <p className="hint">{t("admin.hint")}</p>
      {err ? <p className="error">{err}</p> : null}
      {ok ? <p className="success">{ok}</p> : null}

      <section className="card" style={{ marginBottom: "1rem" }}>
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>{t("admin.inviteTitle")}</h2>
            <p className="hint" style={{ margin: "0.25rem 0 0" }}>
              {t("admin.inviteHint")}
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={createInvite} disabled={creating}>
            {creating ? t("admin.creating") : t("admin.createInvite")}
          </button>
        </div>
        {newCode ? (
          <div className="invite-code">
            <code>{newCode}</code>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void navigator.clipboard.writeText(newCode)}
            >
              {t("admin.copy")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="stats-grid" style={{ marginBottom: "1rem" }}>
        {stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>{t("admin.inviteList")}</h2>
        <div className="list">
          {codes.length === 0 ? <p className="hint">{t("admin.noInvites")}</p> : null}
          {codes.map((code) => (
            <div className="list-item" key={code.id}>
              <div>
                <h3>{code.code}</h3>
                <p className="muted">
                  {t("admin.createdAt")}: {formatTime(code.createdAt)}
                </p>
              </div>
              <span className={code.usedAt ? "status-pill status-pill--used" : "status-pill"}>
                {code.usedAt ? `${t("admin.usedAt")} ${formatTime(code.usedAt)}` : t("admin.unused")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <div
          className="row-actions"
          style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{t("admin.playLibrary")}</h2>
            <p className="hint" style={{ margin: "0.25rem 0 0" }}>
              {t("admin.playLibraryHint")}
            </p>
          </div>
          <button type="button" className="btn" disabled={playsLibLoading} onClick={() => void loadPlaysLib()}>
            {playsLibLoading ? t("view.loading") : t("admin.playsListLoad")}
          </button>
        </div>
        <div className="list">
          {playsLib.map((p) => (
            <div className="list-item" key={p.id}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{p.name}</h3>
                <p className="muted">
                  {p.author.name} · {p.author.email}
                  {p.category ? ` · ${p.category}` : ""}
                  {" "}
                  · {formatTime(p.updatedAt)}
                </p>
              </div>
              <div className="row-actions" style={{ alignItems: "center" }}>
                <label className="muted" htmlFor={`lib-${p.id}`} style={{ marginRight: "0.35rem" }}>
                  {t("admin.libraryScope")}
                </label>
                <select
                  id={`lib-${p.id}`}
                  className="btn"
                  value={p.libraryScope}
                  disabled={updatingPlayId === p.id}
                  onChange={(e) => {
                    const v = e.target.value as AdminPlayRow["libraryScope"];
                    if (v !== p.libraryScope) void setPlayLibraryScope(p.id, v);
                  }}
                >
                  <option value="all_coaches">{t("admin.scopeAll")}</option>
                  <option value="partial">{t("admin.scopePartial")}</option>
                  <option value="hidden">{t("admin.scopeHidden")}</option>
                </select>
              </div>
            </div>
          ))}
          {playsLib.length === 0 && !playsLibLoading ? (
            <p className="hint">{t("lib.empty")}</p>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{t("admin.userList")}</h2>
        <div className="list">
          {users.map((u) => (
            <div className="list-item" key={u.id}>
              <div>
                <h3>{u.name || u.email}</h3>
                <p className="muted">{u.email}</p>
              </div>
              <div className="admin-user-actions">
                <span className="status-pill">
                  {u.role} · {formatTime(u.createdAt)}
                </span>
                <input
                  type="password"
                  minLength={8}
                  placeholder={t("admin.newPassword")}
                  value={passwords[u.id] ?? ""}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, [u.id]: e.target.value }))}
                />
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  disabled={resettingUserId === u.id}
                  onClick={() => void resetPassword(u)}
                >
                  {resettingUserId === u.id ? t("admin.resetting") : t("admin.resetPassword")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
