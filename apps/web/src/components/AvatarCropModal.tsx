import { useCallback, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useT } from "../i18n";
import { cropPixelsToCircularJpegDataUrl } from "../lib/avatar-crop-export";

type Props = {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (jpegDataUrl: string) => void;
};

export function AvatarCropModal({ imageSrc, onCancel, onConfirm }: Props) {
  const { t } = useT();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function confirm() {
    if (!croppedAreaPixels) return;
    setLocalErr(null);
    setBusy(true);
    try {
      const dataUrl = await cropPixelsToCircularJpegDataUrl(imageSrc, croppedAreaPixels);
      onConfirm(dataUrl);
    } catch {
      setLocalErr(t("profile.cropFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      onClick={onCancel}
    >
      <div className="modal-content avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 id="avatar-crop-title" style={{ margin: 0, fontSize: "1.1rem" }}>
            {t("profile.cropTitle")}
          </h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
            {t("profile.cropCancel")}
          </button>
        </div>
        <p className="hint" style={{ margin: "0 0 0.75rem" }}>
          {t("profile.cropHint")}
        </p>
        {localErr ? <p className="error" style={{ marginBottom: "0.5rem" }}>{localErr}</p> : null}
        <div className="avatar-crop-wrap">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={1}
            maxZoom={4}
          />
        </div>
        <div className="field" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          <label htmlFor="avatar-crop-zoom">{t("profile.cropZoom")}</label>
          <input
            id="avatar-crop-zoom"
            type="range"
            className="preview-controls__range"
            min={1}
            max={4}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </div>
        <div className="row-actions" style={{ marginTop: "1rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t("profile.cropCancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !croppedAreaPixels}
            onClick={() => void confirm()}
          >
            {busy ? t("profile.cropWorking") : t("profile.cropConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
