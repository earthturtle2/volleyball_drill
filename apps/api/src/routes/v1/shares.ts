import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { matchPreparations, matchPrepShares, playShares, plays } from "../../db/schema.js";
import { sendError } from "../../lib/errors.js";
import { env } from "../../lib/env.js";
import { serializePrepDetail } from "./match-preps.js";

const shareCreateBody = z.object({
  expiresAt: z.string().datetime().optional(),
});

function buildShareResponse(s: typeof playShares.$inferSelect) {
  const viewUrl = `${env.publicAppUrl.replace(/\/$/, "")}/view/${s.token}`;
  return {
    shareId: s.id,
    token: s.token,
    viewUrl,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

function buildMatchPrepShareResponse(s: typeof matchPrepShares.$inferSelect) {
  const viewUrl = `${env.publicAppUrl.replace(/\/$/, "")}/view/prep/${s.token}`;
  return {
    shareId: s.id,
    token: s.token,
    viewUrl,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Public: anyone with the share token can view. */
export async function publicShareRoutes(fastify: FastifyInstance) {
  fastify.get("/shares/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const s = (
      await db.select().from(playShares).where(eq(playShares.token, token)).limit(1)
    )[0];
    if (!s) return sendError(reply, 404, "NOT_FOUND", "分享不存在或已撤销");
    if (s.expiresAt && s.expiresAt < new Date()) {
      return sendError(reply, 410, "GONE", "分享已过期");
    }
    const p = (await db.select().from(plays).where(eq(plays.id, s.playId)).limit(1))[0];
    if (!p || p.deletedAt) return sendError(reply, 404, "NOT_FOUND", "战术不存在");
    return reply.send({
      play: {
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        tags: p.tags,
        document: p.document,
        updatedAt: p.updatedAt.toISOString(),
      },
      share: { id: s.id, expiresAt: s.expiresAt?.toISOString() ?? null },
    });
  });

  fastify.get("/match-prep-shares/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const s = (
      await db.select().from(matchPrepShares).where(eq(matchPrepShares.token, token)).limit(1)
    )[0];
    if (!s) return sendError(reply, 404, "NOT_FOUND", "分享不存在或已撤销");
    if (s.expiresAt && s.expiresAt < new Date()) {
      return sendError(reply, 410, "GONE", "分享已过期");
    }
    const prep = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, s.prepId)).limit(1))[0];
    if (!prep) return sendError(reply, 404, "NOT_FOUND", "比赛准备不存在");
    return reply.send({
      prep: await serializePrepDetail(prep),
      share: { id: s.id, expiresAt: s.expiresAt?.toISOString() ?? null },
    });
  });
}

/** Protected: owner can create / delete shares. */
export async function protectedShareRoutes(fastify: FastifyInstance) {
  fastify.get("/plays/:playId/shares", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const rows = await db.select().from(playShares).where(eq(playShares.playId, row.id));
    const now = new Date();
    return reply.send(
      rows
        .filter((s) => !s.expiresAt || s.expiresAt >= now)
        .map(buildShareResponse),
    );
  });

  fastify.post("/plays/:playId/shares", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const body = shareCreateBody.parse((request as { body: unknown }).body ?? {});
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const token = nanoid(12);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const [s] = await db
      .insert(playShares)
      .values({ playId: row.id, token, expiresAt: expiresAt ?? null })
      .returning();
    if (!s) return sendError(reply, 500, "INTERNAL", "创建分享失败");
    return reply.status(201).send(buildShareResponse(s));
  });

  fastify.get("/match-preps/:prepId/shares", async (request, reply) => {
    const { prepId } = request.params as { prepId: string };
    const row = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, prepId)).limit(1))[0];
    if (!row || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const rows = await db.select().from(matchPrepShares).where(eq(matchPrepShares.prepId, row.id));
    const now = new Date();
    return reply.send(
      rows
        .filter((s) => !s.expiresAt || s.expiresAt >= now)
        .map(buildMatchPrepShareResponse),
    );
  });

  fastify.post("/match-preps/:prepId/shares", async (request, reply) => {
    const { prepId } = request.params as { prepId: string };
    const body = shareCreateBody.parse((request as { body: unknown }).body ?? {});
    const row = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, prepId)).limit(1))[0];
    if (!row || row.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const token = nanoid(12);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const [s] = await db
      .insert(matchPrepShares)
      .values({ prepId: row.id, token, expiresAt: expiresAt ?? null })
      .returning();
    if (!s) return sendError(reply, 500, "INTERNAL", "创建分享失败");
    return reply.status(201).send(buildMatchPrepShareResponse(s));
  });

  fastify.delete("/shares/:shareId", async (request, reply) => {
    const { shareId } = request.params as { shareId: string };
    const s = (
      await db.select().from(playShares).where(eq(playShares.id, shareId)).limit(1)
    )[0];
    if (!s) return sendError(reply, 404, "NOT_FOUND", "未找到");
    const p = (await db.select().from(plays).where(eq(plays.id, s.playId)).limit(1))[0];
    if (!p || p.deletedAt || p.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    await db.delete(playShares).where(eq(playShares.id, shareId));
    return reply.status(204).send();
  });

  fastify.delete("/match-prep-shares/:shareId", async (request, reply) => {
    const { shareId } = request.params as { shareId: string };
    const s = (
      await db.select().from(matchPrepShares).where(eq(matchPrepShares.id, shareId)).limit(1)
    )[0];
    if (!s) return sendError(reply, 404, "NOT_FOUND", "未找到");
    const prep = (await db.select().from(matchPreparations).where(eq(matchPreparations.id, s.prepId)).limit(1))[0];
    if (!prep || prep.userId !== request.user!.id) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    await db.delete(matchPrepShares).where(eq(matchPrepShares.id, shareId));
    return reply.status(204).send();
  });
}
