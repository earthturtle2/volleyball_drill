import { Component, type ReactNode } from "react";
import { LangContext } from "./i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  static contextType = LangContext;
  declare context: React.ContextType<typeof LangContext>;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const { t } = this.context;
      return (
        <div
          className="card"
          style={{ maxWidth: 500, margin: "2rem auto", textAlign: "center" }}
        >
          <h2 style={{ margin: "0 0 0.5rem" }}>{t("error.title")}</h2>
          <p className="muted">{this.state.error.message}</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/";
            }}
          >
            {t("error.backHome")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
