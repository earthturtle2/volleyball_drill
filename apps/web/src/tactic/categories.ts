import type { TacticDocumentV1 } from "@volleyball/shared";

export const TACTIC_CATEGORY_KEYS = [
  "playCategory.serveReceive",
  "playCategory.serving",
  "playCategory.firstPass",
  "playCategory.setting",
  "playCategory.quickAttack",
  "playCategory.pinAttack",
  "playCategory.backRowAttack",
  "playCategory.blockDefense",
  "playCategory.transition",
  "playCategory.afterTimeout",
  "playCategory.endGame",
] as const;

export function cleanTacticCategory(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 64);
}

export function uniqueCategoryOptions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of values) {
    const category = cleanTacticCategory(value);
    if (!category) continue;
    const key = category.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(category);
  }
  return options;
}

function suggestedCategoryLetter(category: string) {
  const text = category.toLocaleLowerCase();
  if (/receive|一传|接发/.test(text)) return "R";
  if (/serve|发球/.test(text)) return "S";
  if (/set|setter|二传|组织/.test(text)) return "E";
  if (/quick|快攻|短平快/.test(text)) return "Q";
  if (/pin|outside|opposite|边攻|强攻/.test(text)) return "P";
  if (/back.?row|pipe|后排/.test(text)) return "B";
  if (/block|拦网|拦防/.test(text)) return "L";
  if (/transition|转换|防反/.test(text)) return "T";
  if (/after|ato|暂停/.test(text)) return "A";
  if (/end|关键|最后|赛点/.test(text)) return "C";
  const ascii = category.match(/[a-z]/i)?.[0];
  return ascii?.toUpperCase() ?? null;
}

const CATEGORY_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function buildCategoryLetterMap(categories: string[]) {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const normalized = uniqueCategoryOptions(categories);

  function nextAvailableLetter() {
    for (const letter of CATEGORY_LETTERS) {
      if (!used.has(letter)) return letter;
    }
    return "Z";
  }

  for (const category of normalized) {
    const key = category.toLocaleLowerCase();
    const suggested = suggestedCategoryLetter(category);
    const letter = suggested && !used.has(suggested) ? suggested : nextAvailableLetter();
    used.add(letter);
    result.set(key, letter);
  }

  return result;
}

export function formatCategoryCode(
  entry: { category: string; code: string },
  categoryLetters: Map<string, string>,
) {
  const category = cleanTacticCategory(entry.category);
  const code = entry.code.trim();
  const letter = categoryLetters.get(category.toLocaleLowerCase()) ?? suggestedCategoryLetter(category) ?? "X";
  if (code.toLocaleUpperCase().startsWith(letter)) return code;
  return `${letter}${code}`;
}

export function withDocumentCategory(document: TacticDocumentV1, category: string) {
  return {
    ...document,
    meta: {
      ...document.meta,
      category: cleanTacticCategory(category),
    },
  };
}
