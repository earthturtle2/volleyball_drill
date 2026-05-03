import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

export function ChangePasswordPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="hint">{t("view.loading")}</p>;
  if (!user) return <Navigate to="/login" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    if (newPassword !== confirmPassword) {
      setErr(t("password.mismatch"));
      return;
    }
    setSaving(true);
    try {
      await api<{ ok: true }>("/api/v1/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOk(t("password.changed"));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("password.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("password.title")}</h1>
      <p className="hint">{t("password.hint")}</p>
      {err ? <p className="error">{err}</p> : null}
      {ok ? <p className="success">{ok}</p> : null}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="currentPassword">{t("password.current")}</label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="newPassword">{t("password.new")}</label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">{t("password.confirm")}</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? t("password.saving") : t("password.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
