import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { matchPreparations, plays, teams, type MatchPrepEntry } from "../../db/schema.js";
import { sendError } from "../../lib/errors.js";
import { ensureTacticCategories } from "../../lib/tactic-categories.js";

const prepEntryBody = z.object({
  id: z.string().max(80).optional(),
  playId: z.string().min(1),
  code: z.string().min(1).max(32),
  category: z.string().min(1).max(64),
  cue: z.string().max(140).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const prepCreateBody = z.object({
  title: z.string().min(1).max(160),
  opponent: z.string().max(120).nullable().optional(),
  gameDate: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  teamId: z.string().nullable().optional(),
  entries: z.array(prepEntryBody).max(80).optional(),
});

const prepPatchBody = z.object({
  title: z.string().min(1).max(160).optional(),
  opponent: z.string().max(120).nullable().optional(),
  gameDate: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  teamId: z.string().nullable().optional(),
  entries: z.array(prepEntryBody).max(80).optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  teamId: z.string().optional(),
});

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text || null;
}

function parseGameDate(value: string | null | undefined, reply: FastifyReply) {
  if (value === undefined) return undefined;
  const text = value?.trim() ?? "";
  if (!text) return null;
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    sendError(reply, 400, "INVALID_DATE", "比赛日期无效");
    return undefined;
  }
  return date;
}

async function ownedTeamIdOrError(reply: FastifyReply, userId: string, teamId: string | null | undefined) {
  const id = teamId?.trim() || null;
  if (!id) return null;
  const row = (await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, id), eq(teams.userId, userId))).limit(1))[0];
  if (!row) {
    sendError(reply, 400, "INVALID_TEAM", "球队不存在或无权使用");
    return undefined;
  }
  return id;
}

async function normalizeEntriesOrError(
  reply: FastifyReply,
  userId: string,
  entries: z.infer<typeof prepEntryBody>[],
) {
  const normalized: MatchPrepEntry[] = entries.map((entry, index) => ({
    id: entry.id?.trim() || randomUUID(),
    playId: entry.playId.trim(),
    code: entry.code.trim(),
    category: entry.category.trim(),
    cue: cleanText(entry.cue) ?? undefined,
    notes: cleanText(entry.notes) ?? undefined,
    sortOrder: entry.sortOrder ?? index,
  }));

  const codeSet = new Set<string>();
  for (const entry of normalized) {
    if (!entry.playId || !entry.code || !entry.category) {
      sendError(reply, 400, "VALIDATION", "战术、编号和分类不能为空");
      return undefined;
    }
    const codeKey = `${entry.category.toLocaleLowerCase()}\u0000${entry.code.toLocaleLowerCase()}`;
    if (codeSet.has(codeKey)) {
      sendError(reply, 400, "DUPLICATE_CODE", "同一分类中的战术编号不能重复");
      return undefined;
    }
    codeSet.add(codeKey);
  }

  const playIds = [...new Set(normalized.map((entry) => entry.playId))];
  if (playIds.length > 0) {
    const rows = await db
      .select({ id: plays.id })
      .from(plays)
      .where(and(eq(plays.userId, userId), isNull(plays.deletedAt), inArray(plays.id, playIds)));
    if (rows.length !== playIds.length) {
      sendError(reply, 400, "INVALID_PLAY", "战术不存在或无权使用");
      return undefined;
    }
  }

  await ensureTacticCategories(userId, normalized.map((entry) => entry.category));

  return normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function serializePrepList(row: typeof matchPreparations.$inferSelect) {
  const categories = [...new Set(row.entries.map((entry) => entry.category).filter(Boolean))];
  return {
    id: row.id,
    title: row.title,
    opponent: row.opponent,
    gameDate: row.gameDate?.toISOString() ?? null,
    notes: row.notes,
    teamId: row.teamId,
    entryCount: row.entries.length,
    categories,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function serializePrepDetail(row: typeof matchPreparations.$inferSelect) {
  const entries = [...row.entries].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const playIds = [...new Set(entries.map((entry) => entry.playId))];
  const playRows = playIds.length
    ? await db
      .select({
        id: plays.id,
        name: plays.name,
        description: plays.description,
        category: plays.category,
        tags: plays.tags,
        teamId: plays.teamId,
        teamIds: plays.teamIds,
        document: plays.document,
        updatedAt: plays.updatedAt,
      })
      .from(plays)
      .where(and(inArray(plays.id, playIds), eq(plays.userId, row.userId), isNull(plays.deletedAt)))
    : [];
  const playById = new Map(playRows.map((play) => [play.id, play]));
  return {
    ...serializePrepList(row),
    entries: entries.map((entry) => {
      const play = playById.get(entry.playId);
      return {
        ...entry,
        play: play
          ? {
            ...play,
            updatedAt: play.updatedAt.toISOString(),
          }
          : null,
      };
    }),
  };
}

export async function matchPrepRoutes(fastify: FastifyInstance) {
  fastify.get("/match-preps", async (request, reply) => {
    const q = listQuery.parse((request as { query: Record<string, string> }).query);
    const uid = request.user!.id;
    const conditions: [SQL, ...SQL[]] = [eq(matchPreparations.userId, uid)];
    if (q.q) {
      const pattern = `%${escapeLike(q.q)}%`;
      conditions.push(sql`(lower(${matchPreparations.title}) like lower(${pattern}) or lower(${matchPreparations.opponent}) like lower(${pattern}))`);
    }
    if (q.teamId) {
      conditions.push(eq(matchPreparations.teamId, q.teamId));
    }
    const where = and(...conditions);
    const totalRow = await db.select({ n: count() }).from(matchPreparations).where(where);
    const total = totalRow[0]?.n ?? 0;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await db
      .select()
      .from(matchPreparations)
      .where(where)
      .orderBy(desc(matchPreparations.updatedAt))
      .limit(q.pageSize)
      .offset(offset);
    return reply.send({
      items: rows.map(serializePrepList),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
    });
  });

  fastify.post("/match-preps", async (request, reply) => {
    const body = prepCreateBody.parse(request.body);
    const title = body.title.trim();
    if (!title) return sendError(reply, 400, "VALIDATION", "战术包名称不能为空");
    const gameDate = parseGameDate(body.gameDate, reply);
    if (body.gameDate !== undefined && gameDate === undefined) return;
    const teamId = await ownedTeamIdOrError(reply, request.user!.id, body.teamId);
    if (teamId === undefined) return;
    const entries = await normalizeEntriesOrError(reply, request.user!.id, body.entries ?? []);
    if (!entries) return;
    const [row] = await db
      .insert(matchPreparations)
      .values({
        userId: request.user!.id,
        teamId,
        title,
        opponent: cleanText(body.opponent),
        gameDate,
        notes: cleanText(body.notes),
        entries,
      })
      .returning();
    if (!row) return sendError(reply, 500, "INTERNAL", "创建失败");
    return reply.status(201).send(await serializePrepDetail(row));
  });

  fastify.get("/match-preps/:prepId", async (request, reply) => {
    const { prepId } = request.params as { prepId: string };
    const row = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, prepId)).limit(1))[0];
    if (!row || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    return reply.send(await serializePrepDetail(row));
  });

  fastify.patch("/match-preps/:prepId", async (request, reply) => {
    const { prepId } = request.params as { prepId: string };
    const body = prepPatchBody.parse(request.body ?? {});
    const row = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, prepId)).limit(1))[0];
    if (!row || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }

    const updates: Partial<typeof matchPreparations.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) return sendError(reply, 400, "VALIDATION", "战术包名称不能为空");
      updates.title = title;
    }
    if (body.opponent !== undefined) updates.opponent = cleanText(body.opponent);
    if (body.notes !== undefined) updates.notes = cleanText(body.notes);
    if (body.gameDate !== undefined) {
      const gameDate = parseGameDate(body.gameDate, reply);
      if (gameDate === undefined) return;
      updates.gameDate = gameDate;
    }
    if (body.teamId !== undefined) {
      const teamId = await ownedTeamIdOrError(reply, request.user!.id, body.teamId);
      if (teamId === undefined) return;
      updates.teamId = teamId;
    }
    if (body.entries !== undefined) {
      const entries = await normalizeEntriesOrError(reply, request.user!.id, body.entries);
      if (!entries) return;
      updates.entries = entries;
    }

    const [updated] = await db
      .update(matchPreparations)
      .set(updates)
      .where(eq(matchPreparations.id, prepId))
      .returning();
    if (!updated) return sendError(reply, 500, "INTERNAL", "更新失败");
    return reply.send(await serializePrepDetail(updated));
  });

  fastify.delete("/match-preps/:prepId", async (request, reply) => {
    const { prepId } = request.params as { prepId: string };
    const row = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, prepId)).limit(1))[0];
    if (!row || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    await db.delete(matchPreparations).where(eq(matchPreparations.id, prepId));
    return reply.status(204).send();
  });
}
