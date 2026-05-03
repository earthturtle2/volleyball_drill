import type { Area } from "react-easy-crop";

const OUTPUT = 256;
const MAX_DATA_URL_LEN = 100_000;
const CIRCLE_BG = "#122a17";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    img.src = src;
  });
}

function drawSquareCropToCanvas(
  image: HTMLImageElement,
  pixelCrop: Area,
  size: number,
): HTMLCanvasElement {
  let sx = Math.round(pixelCrop.x);
  let sy = Math.round(pixelCrop.y);
  let sw = Math.round(pixelCrop.width);
  let sh = Math.round(pixelCrop.height);
  sx = Math.max(0, Math.min(sx, image.naturalWidth - 1));
  sy = Math.max(0, Math.min(sy, image.naturalHeight - 1));
  sw = Math.max(1, Math.min(sw, image.naturalWidth - sx));
  sh = Math.max(1, Math.min(sh, image.naturalHeight - sy));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
  return canvas;
}

/** 圆外填充背景，便于在不加 border-radius 时仍接近圆形观感 */
function applyCircularMask(source: HTMLCanvasElement, size: number, bg: string): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(source, 0, 0, size, size);
  ctx.restore();
  return out;
}

function canvasToJpegUnderLimit(canvas: HTMLCanvasElement): string {
  let q = 0.9;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length > MAX_DATA_URL_LEN && q > 0.45) {
    q -= 0.05;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  if (dataUrl.length <= MAX_DATA_URL_LEN) return dataUrl;

  const small = document.createElement("canvas");
  const s = 192;
  small.width = s;
  small.height = s;
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("NO_CANVAS");
  sctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, s, s);
  return small.toDataURL("image/jpeg", 0.82);
}

/** 将当前圆形选区导出为固定边长的 JPEG（data URL），并控制体积便于服务端校验。 */
export async function cropPixelsToCircularJpegDataUrl(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await loadImage(imageSrc);
  const square = drawSquareCropToCanvas(image, pixelCrop, OUTPUT);
  const circled = applyCircularMask(square, OUTPUT, CIRCLE_BG);
  return canvasToJpegUnderLimit(circled);
}
