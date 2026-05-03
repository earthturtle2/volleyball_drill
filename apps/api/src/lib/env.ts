import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// dev (tsx):  here = apps/api/src/lib  → 4 levels up = repo root
// prod (tsc): here = apps/api/dist/lib → 4 levels up = repo root
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const apiRoot = resolve(repoRoot, "apps/api");

config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, ".env.local") });
config({ path: resolve(apiRoot, ".env") });

function req(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${name}`);
  return v;
}

function intInRange(
  name: string,
  def: number,
  min: number,
  max: number,
) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return def;
  return Math.trunc(n);
}

/** Access JWT lifetime (default 15m). Affects `expiresIn` in auth responses. */
const accessTokenTtlSeconds = intInRange("JWT_ACCESS_TTL_SECONDS", 15 * 60, 60, 24 * 60 * 60);

/**
 * Opaque refresh token lifetime in days (default 30). Rotates on each `/auth/refresh`;
 * active users get a rolling window. Increase via env to reduce re-logins.
 */
const refreshTokenTtlDays = intInRange("JWT_REFRESH_TTL_DAYS", 30, 1, 365);

export const env = {
  databaseUrl: req("DATABASE_URL"),
  jwtAccessSecret: req("JWT_ACCESS_SECRET"),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:5173",
  port: Number(process.env.PORT ?? 3003),
  host: process.env.HOST ?? "0.0.0.0",
  accessTokenTtlSeconds,
  refreshTokenTtlDays,
};
