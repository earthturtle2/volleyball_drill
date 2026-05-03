import { parseTacticDocumentV1, DEFAULT_TACTIC_DOCUMENT, type TacticDocumentV1 } from "@volleyball/shared";

export { DEFAULT_TACTIC_DOCUMENT };

function mergeMeta(
  name: string,
  description: string | null,
  tags: string[],
  category: string | null | undefined,
  doc: TacticDocumentV1,
): TacticDocumentV1 {
  const nextCategory = category === undefined ? doc.meta?.category : (category ?? "");
  return {
    ...doc,
    meta: {
      ...doc.meta,
      name,
      description: description ?? doc.meta?.description,
      category: nextCategory,
      tags: tags.length ? tags : (doc.meta?.tags ?? []),
    },
  };
}

export function buildDocumentFromInput(input: {
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  document: unknown;
}): TacticDocumentV1 {
  const doc = parseTacticDocumentV1(input.document);
  return mergeMeta(input.name, input.description ?? null, input.tags ?? doc.meta?.tags ?? [], input.category, doc);
}

export function buildDocumentOnUpdate(
  existing: TacticDocumentV1,
  rowName: string,
  patch: { name?: string; description?: string | null; category?: string | null; tags?: string[]; document?: unknown },
): TacticDocumentV1 {
  const base = patch.document !== undefined ? parseTacticDocumentV1(patch.document) : existing;
  const name =
    (patch.name && patch.name.trim()) ||
    (typeof base.meta?.name === "string" && base.meta.name.trim()) ||
    rowName ||
    "未命名";
  const description =
    patch.description === undefined
      ? (base.meta?.description as string | undefined) ?? null
      : patch.description;
  const tags = (patch.tags ?? (base.meta?.tags as string[] | undefined) ?? []) as string[];
  return mergeMeta(name, description, Array.isArray(tags) ? tags : [], patch.category, base);
}
