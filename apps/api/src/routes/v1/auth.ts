import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, sqliteDb } from "../../db/index.js";
import { users, refreshTokens } from "../../db/schema.js";
import {
  signAccessToken,
  createRefreshTokenRaw,
  hashRefreshToken,
  refreshExpiresAt,
  getAccessTtlSeconds,
} from "../../lib/tokens.js";
import { HttpError, sendError } from "../../lib/errors.js";

const registerBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
  inviteCode: z.string().trim().min(1).max(64).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

type RegisterTxInput = {
  email: string;
  passwordHash: string;
  name?: string | null;
  inviteCode?: string;
};

type RegisteredUser = { id: string; email: string; role: string };

const registerUserTx = sqliteDb.transaction((input: RegisterTxInput): RegisteredUser => {
  const now = Date.now();
  const duplicate = sqliteDb
    .prepare("select id from users where email = ? limit 1")
    .get(input.email);
  if (duplicate) {
    throw new HttpError(409, "EMAIL_TAKEN", "该邮箱已注册");
  }

  const countRow = sqliteDb.prepare("select count(*) as n from users").get() as
    | { n: number | bigint }
    | undefined;
  const isFirstUser = Number(countRow?.n ?? 0) === 0;
  let invite:
    | { id: string; used_at: number | null; expires_at: number | null }
    | undefined;

  if (input.inviteCode) {
    invite = sqliteDb
      .prepare("select id, used_at, expires_at from invite_codes where code = ? limit 1")
      .get(input.inviteCode) as
      | { id: string; used_at: number | null; expires_at: number | null }
      | undefined;
  }

  if (!isFirstUser) {
    if (!invite) throw new HttpError(400, "INVITE_REQUIRED", "需要有效邀请码才能注册");
    if (invite.used_at) throw new HttpError(400, "INVITE_USED", "邀请码已被使用");
    if (invite.expires_at && invite.expires_at < now) {
      throw new HttpError(400, "INVITE_EXPIRED", "邀请码已过期");
    }
  }

  const userId = randomUUID();
  const role = isFirstUser ? "admin" : "coach";
  sqliteDb
    .prepare(
      `insert into users (id, email, password_hash, name, role, created_at)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, input.email, input.passwordHash, input.name ?? null, role, now);

  if (!isFirstUser && invite) {
    const updated = sqliteDb
      .prepare("update invite_codes set used_by = ?, used_at = ? where id = ? and used_at is null")
      .run(userId, now, invite.id);
    if (updated.changes !== 1) {
      throw new HttpError(400, "INVITE_USED", "邀请码已被使用");
    }
  }

  return { id: userId, email: input.email, role };
});

async function issueTokens(user: { id: string; email: string; role: string }) {
  const accessToken = signAccessToken(user);
  const raw = createRefreshTokenRaw();
  const tokenHash = hashRefreshToken(raw);
  const exp = refreshExpiresAt();
  await db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt: exp });
  return { accessToken, refreshToken: raw, expiresIn: getAccessTtlSeconds() };
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/register", async (request, reply) => {
    const b = registerBody.parse(request.body);
    const passwordHash = await bcrypt.hash(b.password, 10);
    const u = registerUserTx.immediate({
      email: b.email,
      passwordHash,
      name: b.name ?? null,
      inviteCode: b.inviteCode,
    });
    return reply.send(await issueTokens(u));
  });

  fastify.post("/auth/login", async (request, reply) => {
    const b = loginBody.parse(request.body);
    const u = (await db.select().from(users).where(eq(users.email, b.email)).limit(1))[0];
    if (!u) return sendError(reply, 401, "INVALID_CREDENTIALS", "邮箱或密码错误");
    const ok = await bcrypt.compare(b.password, u.passwordHash);
    if (!ok) return sendError(reply, 401, "INVALID_CREDENTIALS", "邮箱或密码错误");
    return reply.send(await issueTokens(u));
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const b = refreshBody.parse(request.body);
    const h = hashRefreshToken(b.refreshToken);
    const row = (
      await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, h)).limit(1)
    )[0];
    if (!row || row.expiresAt < new Date()) {
      return sendError(reply, 401, "INVALID_REFRESH", "登录已过期，请重新登录");
    }
    await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
    const u = (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];
    if (!u) return sendError(reply, 401, "INVALID_REFRESH", "用户不存在");
    return reply.send(await issueTokens(u));
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const b = refreshBody.parse(request.body);
    const h = hashRefreshToken(b.refreshToken);
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, h));
    return reply.send({ ok: true });
  });

  // Periodically clean up expired refresh tokens
  const CLEANUP_MS = 6 * 60 * 60 * 1000;
  const cleanup = async () => {
    try {
      await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    } catch {
      /* ignore cleanup errors */
    }
  };
  void cleanup();
  const timer = setInterval(() => void cleanup(), CLEANUP_MS);
  fastify.addHook("onClose", () => clearInterval(timer));
}
