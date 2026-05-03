import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { matchPreparations, plays, tacticCategories } from "../db/schema.js";

export const MAX_TACTIC_CATEGORY_LENGTH = 64;

export function cleanTacticCategory(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, MAX_TACTIC_CATEGORY_LENGTH);
}

function uniqueCategories(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const name = cleanTacticCategory(value);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export async function ensureTacticCategories(userId: string, values: Array<string | null | undefined>) {
  const names = uniqueCategories(values);
  if (names.length === 0) return;

  const existingRows = await db
    .select({ name: tacticCategories.name })
    .from(tacticCategories)
    .where(eq(tacticCategories.userId, userId));
  const existing = new Set(existingRows.map((row) => row.name.toLocaleLowerCase()));

  for (const name of names) {
    const key = name.toLocaleLowerCase();
    if (existing.has(key)) continue;
    try {
      await db.insert(tacticCategories).values({ userId, name });
      existing.add(key);
    } catch {
      // Another request may have inserted the same category first.
    }
  }
}

export async function ensureTacticCategory(userId: string, value: string | null | undefined) {
  const name = cleanTacticCategory(value);
  await ensureTacticCategories(userId, [name]);
  return name;
}

export async function listTacticCategories(userId: string) {
  const [categoryRows, playRows, prepRows] = await Promise.all([
    db
      .select({ name: tacticCategories.name })
      .from(tacticCategories)
      .where(eq(tacticCategories.userId, userId))
      .orderBy(asc(tacticCategories.createdAt)),
    db
      .select({ category: plays.category })
      .from(plays)
      .where(and(eq(plays.userId, userId), isNull(plays.deletedAt))),
    db
      .select({ entries: matchPreparations.entries })
      .from(matchPreparations)
      .where(eq(matchPreparations.userId, userId)),
  ]);

  return uniqueCategories([
    ...categoryRows.map((row) => row.name),
    ...playRows.map((row) => row.category),
    ...prepRows.flatMap((row) => row.entries.map((entry) => entry.category)),
  ]);
}
