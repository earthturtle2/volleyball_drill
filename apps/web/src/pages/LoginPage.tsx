import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { useT } from "../i18n";

export function LoginPage() {
  const nav = useNavigate();
  const { user, login } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (user) return <Navigate to="/plays" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(email, password);
      nav("/plays", { replace: true });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("login.failed"));
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>{t("login.title")}</h1>
      <p className="hint">{t("login.hint")}</p>
      {err ? <p className="error">{err}</p> : null}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="e">{t("login.email")}</label>
          <input
            id="e"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="p">{t("login.password")}</label>
          <input
            id="p"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {t("login.submit")}
          </button>
          <Link to="/register" className="btn btn-ghost">
            {t("login.goRegister")}
          </Link>
        </div>
      </form>
    </div>
  );
}
