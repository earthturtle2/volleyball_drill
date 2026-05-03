import "./lib/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerV1 } from "./routes/v1/index.js";
import { globalErrorHandler } from "./lib/errors.js";
import { env } from "./lib/env.js";

async function main() {
  const app = Fastify({ logger: true });

  app.setErrorHandler(globalErrorHandler);

  await app.register(cors, {
    origin:
      process.env.NODE_ENV === "production"
        ? [env.publicAppUrl.replace(/\/$/, "")]
        : true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({ status: "ok" as const }));

  await app.register(registerV1, { prefix: "/api/v1" });

  await app.listen({ port: env.port, host: env.host });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
