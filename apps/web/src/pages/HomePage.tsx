import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { useT } from "../i18n";

const stats = [
  ["home.statTemplatesValue", "home.statTemplatesLabel"],
  ["home.statPlayersValue", "home.statPlayersLabel"],
  ["home.statShareValue", "home.statShareLabel"],
] as const;

const features = [
  ["01", "home.featureTemplateTitle", "home.featureTemplateBody", "home.featureTemplateAction", "/library"],
  ["02", "home.featureEditorTitle", "home.featureEditorBody", "home.featureEditorAction", "/plays"],
  ["03", "home.featurePrepTitle", "home.featurePrepBody", "home.featurePrepAction", "/match-preps"],
] as const;

const workflow = [
  "home.workflowStepPlan",
  "home.workflowStepTeach",
  "home.workflowStepReview",
] as const;

export function HomePage() {
  const { user } = useAuth();
  const { t } = useT();
  const isSignedIn = Boolean(user);

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="home-kicker">{t("home.kicker")}</p>
          <h1>{t("home.title")}</h1>
          <p className="home-lede">{t("home.lede")}</p>
          <div className="home-hero__actions">
            <Link to={isSignedIn ? "/plays" : "/register"} className="btn btn-primary">
              {t(isSignedIn ? "home.actionOpenWorkspace" : "home.actionRegister")}
            </Link>
            <Link to={isSignedIn ? "/library" : "/login"} className="btn btn-ghost">
              {t(isSignedIn ? "home.actionTemplate" : "home.actionLogin")}
            </Link>
          </div>
          <div className="home-pill-line" aria-label={t("home.badgeLabel")}>
            <span>{t("home.badgeVisual")}</span>
            <span>{t("home.badgeShare")}</span>
            <span>{t("home.badgeGamePrep")}</span>
          </div>
        </div>

        <div className="home-hero__visual" aria-label={t("home.demoLabel")}>
          <div className="home-court-card">
            <div className="home-court-card__net" />
            <div className="home-court-card__attack home-court-card__attack--left" />
            <div className="home-court-card__attack home-court-card__attack--right" />
            <span className="home-player home-player--1">1</span>
            <span className="home-player home-player--2">2</span>
            <span className="home-player home-player--3">3</span>
            <span className="home-player home-player--4">4</span>
            <span className="home-player home-player--5">5</span>
            <span className="home-player home-player--6">6</span>
            <span className="home-ball" aria-hidden="true" />
            <span className="home-route home-route--receive" />
            <span className="home-route home-route--set" />
            <span className="home-route home-route--attack" />
          </div>
          <div className="home-demo-card">
            <p>{t("home.demoTitle")}</p>
            <strong>{t("home.demoSubtitle")}</strong>
            <span>{t("home.demoNote")}</span>
          </div>
        </div>
      </section>

      <section className="home-stat-grid" aria-label={t("home.statsLabel")}>
        {stats.map(([valueKey, labelKey]) => (
          <div className="home-stat" key={valueKey}>
            <strong>{t(valueKey)}</strong>
            <span>{t(labelKey)}</span>
          </div>
        ))}
      </section>

      <section className="home-grid" aria-label={t("home.featuresLabel")}>
        {features.map(([index, titleKey, bodyKey, actionKey, signedInHref]) => (
          <article className="home-feature-card" key={titleKey}>
            <span className="home-feature-card__index">{index}</span>
            <h2>{t(titleKey)}</h2>
            <p>{t(bodyKey)}</p>
            <Link to={isSignedIn ? signedInHref : "/login"} className="btn btn-ghost">
              {t(actionKey)}
            </Link>
          </article>
        ))}
      </section>

      <section className="home-workflow card">
        <div>
          <p className="home-kicker">{t("home.workflowKicker")}</p>
          <h2>{t("home.workflowTitle")}</h2>
          <p className="hint">{t("home.workflowBody")}</p>
        </div>
        <ol className="home-workflow__steps">
          {workflow.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
