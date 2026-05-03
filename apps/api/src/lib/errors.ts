import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ code, message });
}

export function zodToMessage(err: ZodError) {
  return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

export function globalErrorHandler(
  error: Error & { statusCode?: number },
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ code: "VALIDATION", message: zodToMessage(error) });
  }
  if (error instanceof HttpError) {
    return reply.status(error.status).send({ code: error.code, message: error.message });
  }
  const status = error.statusCode ?? 500;
  if (status >= 500) {
    request.log.error(error);
  }
  return reply.status(status).send({
    code: status >= 500 ? "INTERNAL" : "ERROR",
    message: status >= 500 ? "服务器内部错误" : error.message,
  });
}
