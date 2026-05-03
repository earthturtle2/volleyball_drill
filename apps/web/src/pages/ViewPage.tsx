import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { TacticDocumentV1 } from "@volleyball/shared";
import { PlaybackPreviewSection } from "../tactic/PlaybackPreviewSection";
import { useT } from "../i18n";

type SharePayload = {
  play: {
    name: string;
    description: string | null;
    category?: string;
    tags: string[];
    document: TacticDocumentV1;
    updatedAt: string;
  };
  share: { id: string; expiresAt: string | null };
};

export function ViewPage() {
  const { token } = useParams();
  const { t } = useT();
  const [data, setData] = useState<SharePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setErr(null);
    void (async () => {
      try {
        const r = await fetch(`/api/v1/shares/${token}`);
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { message?: string };
          if (!cancelled) setErr(j.message ?? t("view.cantOpen"));
          return;
        }
        const j = (await r.json()) as SharePayload;
        if (!cancelled) {
          setData(j);
        }
      } catch {
        if (!cancelled) setErr(t("view.networkError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const doc = data?.play.document;

  if (err) return <p className="error">{err}</p>;
  if (!data || !doc) return <p className="hint">{t("view.loading")}</p>;

  return (
    <div className="view-page">
      <h1 style={{ margin: "0 0 0.25rem" }}>{data.play.name}</h1>
      {data.play.category ? <p className="muted" style={{ margin: "0 0 0.35rem" }}>{data.play.category}</p> : null}
      {data.play.description ? <p className="hint">{data.play.description}</p> : null}
      <PlaybackPreviewSection document={doc} resetPlaybackKey={token} rangeInputId="v" />
    </div>
  );
}
