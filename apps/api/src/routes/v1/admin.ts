import type { FastifyInstance } from "fastify";
import { customAlphabet } from "nanoid";
import { and, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../../db/index.js";
import { inviteCodes, matchPrepShares, playShares, plays, refreshTokens, teams, users } from "../../db/schema.js";
import { sendError } from "../../lib/errors.js";

const inviteBody = z.object({
  expiresAt: z.string().datetime().optional(),
});

const passwordResetBody = z.object({
  password: z.string().min(8).max(128),
});

const adminPlaysListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(40),
  q: z.string().max(200).optional(),
  libraryScope: z.enum(["all_coaches", "partial", "hidden", "any"]).optional(),
});

const adminPlayScopeBody = z.object({
  libraryScope: z.enum(["all_coaches", "partial", "hidden"]),
});

function escapeIlike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const makeInviteCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

function toIso(d: Date | null) {
  return d ? d.toISOString() : null;
}

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get("/admin/users", async (_request, reply) => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(500);

    return reply.send(rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })));
  });

  fastify.patch("/admin/users/:userId/password", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const b = passwordResetBody.parse(request.body);
    const row = (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!row) return sendError(reply, 404, "NOT_FOUND", "用户不存在");
    const passwordHash = await bcrypt.hash(b.password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    return reply.send({ ok: true });
  });

  fastify.get("/admin/status", async (_request, reply) => {
    const [
      userCount,
      adminCount,
      teamCount,
      activePlayCount,
      deletedPlayCount,
      playShareCount,
      matchPrepShareCount,
      refreshTokenCount,
      inviteCount,
      usedInviteCount,
    ] = await Promise.all([
      db.select({ n: count() }).from(users),
      db
        .select({ n: count() })
        .from(users)
        .where(or(eq(users.role, "admin"), eq(users.role, "org_admin"))),
      db.select({ n: count() }).from(teams),
      db.select({ n: count() }).from(plays).where(isNull(plays.deletedAt)),
      db.select({ n: count() }).from(plays).where(isNotNull(plays.deletedAt)),
      db.select({ n: count() }).from(playShares),
      db.select({ n: count() }).from(matchPrepShares),
      db.select({ n: count() }).from(refreshTokens),
      db.select({ n: count() }).from(inviteCodes),
      db.select({ n: count() }).from(inviteCodes).where(isNotNull(inviteCodes.usedAt)),
    ]);
    const recentUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    return reply.send({
      users: Number(userCount[0]?.n ?? 0),
      admins: Number(adminCount[0]?.n ?? 0),
      teams: Number(teamCount[0]?.n ?? 0),
      activePlays: Number(activePlayCount[0]?.n ?? 0),
      deletedPlays: Number(deletedPlayCount[0]?.n ?? 0),
      shares: Number(playShareCount[0]?.n ?? 0) + Number(matchPrepShareCount[0]?.n ?? 0),
      activeSessions: Number(refreshTokenCount[0]?.n ?? 0),
      inviteCodes: Number(inviteCount[0]?.n ?? 0),
      usedInviteCodes: Number(usedInviteCount[0]?.n ?? 0),
      recentUsers: recentUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  });

  fastify.get("/admin/invite-codes", async (_request, reply) => {
    const rows = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        createdBy: inviteCodes.createdBy,
        usedBy: inviteCodes.usedBy,
        expiresAt: inviteCodes.expiresAt,
        createdAt: inviteCodes.createdAt,
        usedAt: inviteCodes.usedAt,
      })
      .from(inviteCodes)
      .orderBy(desc(inviteCodes.createdAt))
      .limit(100);
    return reply.send(
      rows.map((r) => ({
        ...r,
        expiresAt: toIso(r.expiresAt),
        createdAt: r.createdAt.toISOString(),
        usedAt: toIso(r.usedAt),
      })),
    );
  });

  fastify.post("/admin/invite-codes", async (request, reply) => {
    const b = inviteBody.parse(request.body ?? {});
    const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    for (let i = 0; i < 5; i += 1) {
      const code = makeInviteCode();
      try {
        const [row] = await db
          .insert(inviteCodes)
          .values({ code, createdBy: request.user!.id, expiresAt })
          .returning();
        if (!row) break;
        return reply.status(201).send({
          id: row.id,
          code: row.code,
          createdBy: row.createdBy,
          usedBy: row.usedBy,
          expiresAt: toIso(row.expiresAt),
          createdAt: row.createdAt.toISOString(),
          usedAt: toIso(row.usedAt),
        });
      } catch {
        // Extremely unlikely code collision; retry with a fresh code.
      }
    }
    return sendError(reply, 500, "INVITE_CREATE_FAILED", "生成邀请码失败");
  });

  fastify.get("/admin/plays", async (request, reply) => {
    const q = adminPlaysListQuery.parse((request as { query: Record<string, string> }).query);
    const conditions: [SQL, ...SQL[]] = [isNull(plays.deletedAt)];
    if (q.q) {
      const pattern = `%${escapeIlike(q.q)}%`;
      conditions.push(sql`lower(${plays.name}) like lower(${pattern})`);
    }
    if (q.libraryScope && q.libraryScope !== "any") {
      conditions.push(eq(plays.libraryScope, q.libraryScope));
    }
    const where = and(...conditions);
    const totalRow = await db.select({ n: count() }).from(plays).where(where);
    const total = totalRow[0]?.n ?? 0;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await db
      .select({
        id: plays.id,
        name: plays.name,
        category: plays.category,
        userId: plays.userId,
        userEmail: users.email,
        userName: users.name,
        libraryScope: plays.libraryScope,
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
        category: r.category,
        userId: r.userId,
        author: { name: r.userName ?? r.userEmail, email: r.userEmail },
        libraryScope: r.libraryScope,
        updatedAt: r.updatedAt.toISOString(),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
    });
  });

  fastify.patch("/admin/plays/:playId/library", async (request, reply) => {
    const { playId } = request.params as { playId: string };
    const b = adminPlayScopeBody.parse((request as { body: unknown }).body ?? {});
    const row = (await db.select().from(plays).where(eq(plays.id, playId)).limit(1))[0];
    if (!row || row.deletedAt) {
      return sendError(reply, 404, "NOT_FOUND", "未找到");
    }
    const [u] = await db
      .update(plays)
      .set({ libraryScope: b.libraryScope, updatedAt: new Date() })
      .where(eq(plays.id, playId))
      .returning();
    if (!u) {
      return sendError(reply, 500, "INTERNAL", "更新失败");
    }
    return reply.send({
      id: u.id,
      name: u.name,
      userId: u.userId,
      libraryScope: u.libraryScope,
      updatedAt: u.updatedAt.toISOString(),
    });
  });
}
