import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { plays, teams, users } from "../../db/schema.js";
import {
  buildDocumentFromInput,
  buildDocumentOnUpdate,
  DEFAULT_TACTIC_DOCUMENT,
} from "../../lib/tactic.js";
import { sendError, zodToMessage } from "../../lib/errors.js";
import { tryParseTacticDocumentV1 } from "@volleyball/shared";
import {
  cleanTacticCategory,
  ensureTacticCategory,
  listTacticCategories,
} from "../../lib/tactic-categories.js";

const playCreateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(64).optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  document: z.unknown().optional(),
  teamId: z.string().optional(),
  teamIds: z.array(z.string().min(1)).max(50).optional(),
  libraryScope: z.enum(["all_coaches", "partial", "hidden"]).optional(),
  sharedWithUserIds: z.array(z.string().min(1)).max(200).optional(),
});

const playPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(64).optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  document: z.unknown().optional(),
  teamId: z.string().nullable().optional(),
  teamIds: z.array(z.string().min(1)).max(50).optional(),
  libraryScope: z.enum(["all_coaches", "partial", "hidden"]).optional(),
  sharedWithUserIds: z.array(z.string().min(1)).max(200).optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  tag: z.string().max(64).optional(),
  category: z.string().max(64).optional(),
  teamId: z.string().optional(),
});

const duplicateBody = z.object({
  name: z.string().min(1).max(200).optional(),
});

const tacticCategoryBody = z.object({
  name: z.string().min(1).max(64),
});

const libraryScopes = z.enum(["all_coaches", "partial", "hidden"]);
type LibraryScope = z.infer<typeof libraryScopes>;

function escapeIlike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function cleanUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function uniqueTeamIds(teamIds: string[] | undefined, legacyTeamId?: string | null) {
  return cleanUniqueIds([...(teamIds ?? []), ...(legacyTeamId ? [legacyTeamId] : [])]);
}

function uniqueUserIds(userIds: string[] | undefined) {
  return cleanUniqueIds(userIds ?? []);
}

async function ownedTeamIdsOrError(
  reply: FastifyReply,
  userId: string,
  teamIds: string[],
) {
  const ids = cleanUniqueIds(teamIds);
  if (ids.length === 0) return ids;
  const rows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.userId, userId), inArray(teams.id, ids)));
  if (rows.length !== ids.length) {
    sendError(reply, 400, "INVALID_TEAM", "队伍不存在或无权使用");
    return null;
  }
  return ids;
}

function teamIdsFromPatch(
  row: typeof plays.$inferSelect,
  patch: z.infer<typeof playPatchBody>,
) {
  if (patch.teamIds !== undefined) {
    return uniqueTeamIds(patch.teamIds, patch.teamId ?? null);
  }
  if (patch.teamId !== undefined) {
    return uniqueTeamIds(undefined, patch.teamId);
  }
  return uniqueTeamIds(row.teamIds, row.teamId);
}

function isLibraryVisibleTo(row: typeof plays.$inferSelect, userId: string) {
  if (row.userId === userId) return row.libraryScope !== "hidden";
  if (row.libraryScope === "all_coaches") return true;
  if (row.libraryScope === "partial") return row.sharedWithUserIds.includes(userId);
  return false;
}

function libraryVisibilitySql(userId: string) {
  return sql`(${plays.libraryScope} = 'all_coaches' or (${plays.libraryScope} = 'partial' and exists (select 1 from json_each(${plays.sharedWithUserIds}) as j where j.value = ${userId})) or (${plays.userId} = ${userId} and ${plays.libraryScope} != 'hidden'))`;
}

function serializePlay(row: typeof plays.$inferSelect) {
  const category = cleanTacticCategory(row.category || row.document.meta.category);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category,
    tags: row.tags,
    teamId: row.teamId,
    teamIds: uniqueTeamIds(row.teamIds, row.teamId),
    document: row.document,
    libraryScope: row.libraryScope as LibraryScope,
    sharedWithUserIds: row.sharedWithUserIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function playRoutes(fastify: FastifyInstance) {
  fastify.get("/tactic-categories", async (request, reply) => {
    const items = await listTacticCategories(request.user!.id);
    return reply.send({ items });
  });

  fastify.post("/tactic-categories", async (request, reply) => {
    const b = tacticCategoryBody.parse(request.body ?? {});
    const input = cleanTacticCategory(b.name);
    if (!input) return sendError(reply, 400, "VALIDATION", "战术类别不能为空");
    const name = await ensureTacticCategory(request.user!.id, input);
    return reply.status(201).send({ name });
  });

  /** 共享模版库：全部「未删且对全员开放」的战术。路由必须在 `/plays/:playId` 之前。 */
  fastify.get("/plays/library", async (request, reply) => {
    const q = listQuery.parse((request as { query: Record<string, string> }).query);
    const uid = request.user!.id;
    const conditions: [SQL, ...SQL[]] = [
      isNull(plays.deletedAt),
      libraryVisibilitySql(uid),
    ];
    if (q.q) {
      const pattern = `%${escapeIlike(q.q)}%`;
      conditions.push(
        sql`(lower(${plays.name}) like lower(${pattern}) or lower(${users.email}) like lower(${pattern}))`,
      );
    }
    if (q.tag) {
      conditions.push(
        sql`exists (select 1 from json_each(${plays.tags}) as j where j.value = ${q.tag})`,
      );
    }
    if (q.category) {
      conditions.push(eq(plays.category, cleanTacticCategory(q.category)));
    }
    if (q.teamId) {
      conditions.push(
        sql`(${plays.teamId} = ${q.teamId} or json_array_length(${plays.teamIds}) = 0 or exists (select 1 from json_each(${plays.teamIds}) as j where j.value = ${q.teamId}))`,
      );
    }
    const where = and(...conditions);
    const totalRow = await db
      .select({ n: count() })
      .from(plays)
      .innerJoin(users, eq(plays.userId, users.id))
      .where(where);
    const total = totalRow[0]?.n ?? 0;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await db
      .select({
        id: plays.id,
        name: plays.name,
        description: plays.description,
        category: plays.category,
        tags: plays.tags,
        userId: plays.userId,
        teamId: plays.teamId,
        teamIds: plays.teamIds,
        authorName: users.name,
        authorEmail: users.email,
        authorAvatarUrl: users.avatarUrl,
        updatedAt: plays.updatedAt,
      })
      .from(plays)
      .innerJoin(users, eq(plays.userId, users.id))
      .where(where)
      .orderBy(desc(plays.updatedAt))
      .limit(q.pageSize)
      .offset(offset);
    return reply.send({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: cleanTacticCategory(r.category),
        tags: r.tags,
        userId: r.userId,
        teamId: r.teamId,
        teamIds: uniqueTeamIds(r.teamIds, r.teamId),
        author: {
          name: r.authorName ?? r.authorEmail,
          email: r.authorEmail,
          avatarUrl: r.authorAvatarUrl ?? null,
        },
        updatedAt: r.updatedAt.toISOString(),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
    });
  });

  fastify.get("/plays/library/:playId", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const uid = request.user!.id;
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const isOwner = row.userId === uid;
    if (!isOwner && !isLibraryVisibleTo(row, uid)) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const urow = (
      await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
        })
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1)
    )[0];
    if (!urow) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    return reply.send({
      ...serializePlay(row),
      isOwner,
      author: {
        id: urow.id,
        name: urow.name,
        email: urow.email,
        avatarUrl: urow.avatarUrl ?? null,
        bio: urow.bio ?? null,
      },
    });
  });

  fastify.post("/plays/library/:playId/duplicate", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const b = duplicateBody.parse(request.body ?? {});
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    if (row.userId !== request.user!.id) {
      if (!isLibraryVisibleTo(row, request.user!.id)) {
        return sendError(reply, 404, "NOT_FOUND", "未找到");
      }
    }
    const newName = b.name?.trim() || `${row.name}（副本）`;
    const copiedTeamIds =
      row.userId === request.user!.id
        ? await ownedTeamIdsOrError(reply, request.user!.id, uniqueTeamIds(row.teamIds, row.teamId))
        : [];
    if (!copiedTeamIds) return;
    const category = await ensureTacticCategory(
      request.user!.id,
      row.category || row.document.meta.category,
    );
    const [created] = await db
      .insert(plays)
      .values({
        userId: request.user!.id,
        name: newName,
        description: row.description,
        category,
        tags: row.tags,
        teamId: copiedTeamIds[0] ?? null,
        teamIds: copiedTeamIds,
        document: buildDocumentOnUpdate(row.document, row.name, { name: newName, category }),
        libraryScope: "all_coaches" satisfies LibraryScope,
        sharedWithUserIds: [],
      })
      .returning();
    if (!created) return sendError(reply, 500, "INTERNAL", "复制失败");
    return reply.status(201).send(serializePlay(created));
  });

  fastify.get("/plays", async (request, reply) => {
    const q = listQuery.parse((request as { query: Record<string, string> }).query);
    const uid = request.user!.id;
    const conditions: [SQL, ...SQL[]] = [eq(plays.userId, uid), isNull(plays.deletedAt)];
    if (q.q) {
      const pattern = `%${escapeIlike(q.q)}%`;
      conditions.push(sql`lower(${plays.name}) like lower(${pattern})`);
    }
    if (q.tag) {
      conditions.push(
        sql`exists (select 1 from json_each(${plays.tags}) as j where j.value = ${q.tag})`,
      );
    }
    if (q.category) {
      conditions.push(eq(plays.category, cleanTacticCategory(q.category)));
    }
    if (q.teamId) {
      conditions.push(
        sql`(${plays.teamId} = ${q.teamId} or json_array_length(${plays.teamIds}) = 0 or exists (select 1 from json_each(${plays.teamIds}) as j where j.value = ${q.teamId}))`,
      );
    }
    const where = and(...conditions);
    const totalRow = await db.select({ n: count() }).from(plays).where(where);
    const total = totalRow[0]?.n ?? 0;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await db
      .select({
        id: plays.id,
        name: plays.name,
        description: plays.description,
        category: plays.category,
        tags: plays.tags,
        teamId: plays.teamId,
        teamIds: plays.teamIds,
        libraryScope: plays.libraryScope,
        updatedAt: plays.updatedAt,
      })
      .from(plays)
      .where(where)
      .orderBy(desc(plays.updatedAt))
      .limit(q.pageSize)
      .offset(offset);
    return reply.send({
      items: rows.map((r) => ({
        ...r,
        category: cleanTacticCategory(r.category),
        teamIds: uniqueTeamIds(r.teamIds, r.teamId),
        libraryScope: r.libraryScope as LibraryScope,
        updatedAt: r.updatedAt.toISOString(),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
    });
  });

  fastify.post("/plays", async (request, reply) => {
    const b = playCreateBody.parse(request.body);
    const docInput = b.document !== undefined ? b.document : DEFAULT_TACTIC_DOCUMENT;
    const r = tryParseTacticDocumentV1(docInput);
    if (!r.success) {
      return reply.status(400).send({ code: "VALIDATION", message: zodToMessage(r.error) });
    }
    const category = await ensureTacticCategory(
      request.user!.id,
      b.category ?? r.data.meta.category,
    );
    const document = buildDocumentFromInput({
      name: b.name,
      description: b.description,
      category,
      tags: b.tags,
      document: r.data,
    });
    const assignedTeamIds = await ownedTeamIdsOrError(
      reply,
      request.user!.id,
      uniqueTeamIds(b.teamIds, b.teamId),
    );
    if (!assignedTeamIds) return;
    const [row] = await db
      .insert(plays)
      .values({
        userId: request.user!.id,
        teamId: assignedTeamIds[0] ?? null,
        teamIds: assignedTeamIds,
        name: b.name,
        description: b.description ?? null,
        category,
        tags: b.tags ?? [],
        document,
        libraryScope: b.libraryScope ?? "all_coaches",
        sharedWithUserIds: b.libraryScope === "partial" ? uniqueUserIds(b.sharedWithUserIds) : [],
      })
      .returning();
    if (!row) return sendError(reply, 500, "INTERNAL", "创建失败");
    return reply.status(201).send(serializePlay(row));
  });

  fastify.get("/plays/:playId", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    return reply.send(serializePlay(row));
  });

  fastify.patch("/plays/:playId", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const b = playPatchBody.parse(request.body);
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    let documentCategory: string | undefined;
    if (b.document !== undefined) {
      const r = tryParseTacticDocumentV1(b.document);
      if (!r.success) {
        return reply.status(400).send({ code: "VALIDATION", message: zodToMessage(r.error) });
      }
      documentCategory = r.data.meta.category;
    }
    const categoryInput =
      b.category !== undefined
        ? b.category
        : (documentCategory ?? (row.category || row.document.meta.category));
    const category = await ensureTacticCategory(request.user!.id, categoryInput);
    const document = buildDocumentOnUpdate(row.document, row.name, { ...b, category });
    const nextLibraryScope = b.libraryScope === undefined ? row.libraryScope : b.libraryScope;
    const nextSharedWithUserIds =
      nextLibraryScope === "partial"
        ? uniqueUserIds(b.sharedWithUserIds ?? (row.libraryScope === "partial" ? row.sharedWithUserIds : []))
        : [];
    const teamAssignmentChanged = b.teamIds !== undefined || b.teamId !== undefined;
    const nextTeamIds = teamAssignmentChanged
      ? await ownedTeamIdsOrError(reply, request.user!.id, teamIdsFromPatch(row, b))
      : row.teamIds;
    if (!nextTeamIds) return;
    const [u] = await db
      .update(plays)
      .set({
        name: b.name !== undefined ? b.name : row.name,
        description: b.description === undefined ? row.description : b.description,
        category,
        tags: b.tags !== undefined ? b.tags : row.tags,
        teamId: teamAssignmentChanged ? (nextTeamIds[0] ?? null) : row.teamId,
        teamIds: nextTeamIds,
        libraryScope: nextLibraryScope,
        sharedWithUserIds: nextSharedWithUserIds,
        document,
        updatedAt: new Date(),
      })
      .where(eq(plays.id, playId))
      .returning();
    if (!u) return sendError(reply, 500, "INTERNAL", "更新失败");
    return reply.send(serializePlay(u));
  });

  fastify.delete("/plays/:playId", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    await db.update(plays).set({ deletedAt: new Date() }).where(eq(plays.id, playId));
    return reply.status(204).send();
  });

  fastify.post("/plays/:playId/duplicate", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const b = duplicateBody.parse(request.body ?? {});
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const newName = b.name?.trim() || `${row.name}（副本）`;
    const copiedTeamIds = await ownedTeamIdsOrError(
      reply,
      request.user!.id,
      uniqueTeamIds(row.teamIds, row.teamId),
    );
    if (!copiedTeamIds) return;
    const category = await ensureTacticCategory(
      request.user!.id,
      row.category || row.document.meta.category,
    );
    const [created] = await db
      .insert(plays)
      .values({
        userId: request.user!.id,
        name: newName,
        description: row.description,
        category,
        tags: row.tags,
        teamId: copiedTeamIds[0] ?? null,
        teamIds: copiedTeamIds,
        document: buildDocumentOnUpdate(row.document, row.name, { name: newName, category }),
        libraryScope: "all_coaches" satisfies LibraryScope,
        sharedWithUserIds: [],
      })
      .returning();
    if (!created) return sendError(reply, 500, "INTERNAL", "复制失败");
    return reply.status(201).send(serializePlay(created));
  });
}
