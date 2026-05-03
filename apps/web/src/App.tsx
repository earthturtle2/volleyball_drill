import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { useT, LangToggle } from "./i18n";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PlaysPage } from "./pages/PlaysPage";
import { PlayEditPage } from "./pages/PlayEditPage";
import { LibraryPage } from "./pages/LibraryPage";
import { TeamsPage } from "./pages/TeamsPage";
import { MatchPrepsPage } from "./pages/MatchPrepsPage";
import { MatchPrepViewPage } from "./pages/MatchPrepViewPage";
import { ViewPage } from "./pages/ViewPage";
import { AdminPage } from "./pages/AdminPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ProfilePage } from "./pages/ProfilePage";

function isAdmin(role: string) {
  return role === "admin" || role === "org_admin";
}

function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, loading, logout } = useAuth();
  const { t } = useT();
  const [topNavOpen, setTopNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTopNavOpen(false);
    setAccountOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (!topNavOpen && !accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTopNavOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topNavOpen, accountOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [accountOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 980px)");
    const onWide = () => {
      if (mq.matches) setTopNavOpen(false);
    };
    mq.addEventListener("change", onWide);
    return () => mq.removeEventListener("change", onWide);
  }, []);

  if (loc.pathname.startsWith("/view/")) {
    return <div className="app-shell">{children}</div>;
  }

  const closeNav = () => {
    setTopNavOpen(false);
    setAccountOpen(false);
  };
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `btn btn-ghost nav-link${isActive ? " nav-link--active" : ""}`;
  const accountActive = loc.pathname === "/profile" || loc.pathname === "/password";

  return (
    <div className="app-shell">
      <header className={`top${topNavOpen ? " top--nav-open" : ""}`}>
        <Link to={user ? "/plays" : "/"} className="brand">
          {t("app.brand")}
        </Link>
        <button
          type="button"
          className="top-menu-toggle"
          aria-expanded={topNavOpen}
          aria-controls="site-nav"
          aria-label={t("app.toggleNav")}
          onClick={() => setTopNavOpen((o) => !o)}
        >
          <span className="top-menu-toggle__bar" />
          <span className="top-menu-toggle__bar" />
          <span className="top-menu-toggle__bar" />
        </button>
        <nav id="site-nav" className="top-nav">
          {loading ? null : user ? (
            <>
              <div className="top-nav__primary" aria-label={t("app.primaryNav")}>
                <NavLink to="/plays" className={navLinkClass} onClick={closeNav}>
                  {t("app.myPlays")}
                </NavLink>
                <NavLink to="/library" className={navLinkClass} onClick={closeNav}>
                  {t("app.library")}
                </NavLink>
                <NavLink to="/teams" className={navLinkClass} onClick={closeNav}>
                  {t("app.teams")}
                </NavLink>
                <NavLink to="/match-preps" className={navLinkClass} onClick={closeNav}>
                  {t("app.matchPreps")}
                </NavLink>
                {isAdmin(user.role) ? (
                  <NavLink to="/admin" className={navLinkClass} onClick={closeNav}>
                    {t("app.admin")}
                  </NavLink>
                ) : null}
              </div>
              <div className="top-nav__account" ref={accountRef}>
                <button
                  type="button"
                  className={`btn btn-ghost top-account-trigger${accountOpen || accountActive ? " nav-link--active" : ""}`}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountOpen((o) => !o)}
                >
                  <span className="top-account-avatar" aria-hidden="true">
                    {(user.name || user.email || "?").trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="top-account-label">{user.name?.trim() || t("app.account")}</span>
                  <span className="top-account-caret" aria-hidden="true">v</span>
                </button>
                {accountOpen ? (
                  <div className="top-account-menu" role="menu">
                    <NavLink to="/profile" className={navLinkClass} onClick={closeNav} role="menuitem">
                      {t("app.profile")}
                    </NavLink>
                    <NavLink to="/password" className={navLinkClass} onClick={closeNav} role="menuitem">
                      {t("app.password")}
                    </NavLink>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      role="menuitem"
                      onClick={() => {
                        closeNav();
                        logout();
                        nav("/login");
                      }}
                    >
                      {t("app.logout")}
                    </button>
                    <LangToggle />
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="top-nav__primary top-nav__primary--guest">
              <NavLink to="/login" className={navLinkClass} onClick={closeNav}>
                {t("app.login")}
              </NavLink>
              <Link to="/register" className="btn btn-primary" onClick={closeNav}>
                {t("app.register")}
              </Link>
              <LangToggle />
            </div>
          )}
        </nav>
      </header>
      {topNavOpen ? (
        <div
          className="top-nav-backdrop"
          aria-hidden="true"
          onClick={() => setTopNavOpen(false)}
        />
      ) : null}
      {children}
    </div>
  );
}

function NotFound() {
  const { t } = useT();
  return <p className="hint">{t("app.notFound")}</p>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user, loading } = useAuth();
  const { t } = useT();
  if (loading) return <p className="hint">{t("view.loading")}</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useT();
  if (!user) return null;
  if (!isAdmin(user.role)) return <p className="error">{t("admin.forbidden")}</p>;
  return children;
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/plays" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/plays"
          element={<RequireAuth><PlaysPage /></RequireAuth>}
        />
        <Route
          path="/library"
          element={<RequireAuth><LibraryPage /></RequireAuth>}
        />
        <Route
          path="/library/builtin/:id"
          element={<RequireAuth><LibraryPage /></RequireAuth>}
        />
        <Route
          path="/library/:id"
          element={<RequireAuth><LibraryPage /></RequireAuth>}
        />
        <Route
          path="/plays/:id"
          element={<RequireAuth><PlayEditPage /></RequireAuth>}
        />
        <Route
          path="/teams"
          element={<RequireAuth><TeamsPage /></RequireAuth>}
        />
        <Route
          path="/match-preps"
          element={<RequireAuth><MatchPrepsPage /></RequireAuth>}
        />
        <Route
          path="/match-preps/:id"
          element={<RequireAuth><MatchPrepsPage /></RequireAuth>}
        />
        <Route
          path="/admin"
          element={<RequireAuth><RequireAdmin><AdminPage /></RequireAdmin></RequireAuth>}
        />
        <Route
          path="/profile"
          element={<RequireAuth><ProfilePage /></RequireAuth>}
        />
        <Route
          path="/password"
          element={<RequireAuth><ChangePasswordPage /></RequireAuth>}
        />
        <Route path="/view/prep/:token" element={<MatchPrepViewPage />} />
        <Route path="/view/:token" element={<ViewPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
