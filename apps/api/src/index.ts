import "./env.js";
import process from "node:process";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { createHealthPayload } from "@itecify/shared";

const prisma = new PrismaClient();

const app = Fastify({
  logger: true,
});

app.get("/health", async () => createHealthPayload("api"));

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.API_PORT ?? "3001");
const host = process.env.API_HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
