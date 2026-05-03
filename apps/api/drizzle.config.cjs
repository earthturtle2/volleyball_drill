/* eslint-disable @typescript-eslint/no-require-imports */
const { resolve, isAbsolute } = require("node:path");
const { config } = require("dotenv");
const { defineConfig } = require("drizzle-kit");

const repoRoot = resolve(__dirname, "../..");
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, ".env.local") });

const raw = process.env.DATABASE_URL;
if (!raw) {
  throw new Error("DATABASE_URL is required, e.g. file:./data/volleyball.db");
}

let url = raw;
if (raw.startsWith("file:")) {
  const p = raw.slice("file:".length);
  if (!isAbsolute(p)) {
    url = `file:${resolve(repoRoot, p)}`;
  }
} else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
  throw new Error(`Unsupported DATABASE_URL scheme for SQLite: ${raw.split(":")[0]}`);
} else if (!isAbsolute(raw)) {
  url = resolve(repoRoot, raw);
}

module.exports = defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url },
});
