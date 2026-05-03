const MAX_AVATAR_DATA = 110_000;
const MAX_AVATAR_HTTP = 2048;

/** 允许 https/http 外链，或本地上传的 JPG/PNG data URL（体积受限）。 */
export function validateAvatarUrl(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const s = raw.trim();
  if ((s.startsWith("https://") || s.startsWith("http://")) && s.length <= MAX_AVATAR_HTTP) {
    return { ok: true, value: s };
  }
  if (
    (s.startsWith("data:image/jpeg;base64,") || s.startsWith("data:image/png;base64,")) &&
    s.length <= MAX_AVATAR_DATA
  ) {
    return { ok: true, value: s };
  }
  return {
    ok: false,
    message: "头像须为 http(s) 图片链接，或不超过大小限制的 JPG/PNG 数据",
  };
}
