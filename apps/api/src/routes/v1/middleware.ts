import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../../lib/tokens.js";

/** Decode JWT and attach user to request — no DB lookup needed. */
export async function authenticate(request: FastifyRequest) {
  const h = request.headers.authorization;
  if (!h?.startsWith("Bearer ")) return;
  try {
    const p = verifyAccessToken(h.slice(7));
    if (p.typ !== "a") return;
    request.user = { id: p.sub, email: p.email, role: p.role };
  } catch {
    /* invalid or expired token */
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.status(401).send({ code: "UNAUTHENTICATED", message: "需要登录" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const role = request.user?.role;
  if (role !== "admin" && role !== "org_admin") {
    return reply.status(403).send({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
}
