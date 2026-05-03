import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ErrorBoundary } from "./ErrorBoundary";
import { LangProvider } from "./i18n";
import { App } from "./App";
import "./styles.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("root missing");
}
createRoot(el).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LangProvider>
            <App />
          </LangProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
