import process from "node:process";
import { buildApp } from "./app.js";

const app = await buildApp();

const port = Number(process.env.API_PORT ?? "3001");
const host = process.env.API_HOST ?? "0.0.0.0";

console.log(`[api] Starting (port ${port})…`);

try {
  await app.listen({ port, host });
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(
    `[api] Ready — http://${shown}:${port}  (GET /health, POST /jobs — necesită sesiune)`,
  );
} catch (err) {
  console.error("[api] Failed to listen (port în uz sau altă eroare):", err);
  await app.close();
  process.exit(1);
}
