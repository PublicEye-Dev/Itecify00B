/**
 * Un room Yjs = parametrul `roomname` din protocolul y-websocket (client: `WebsocketProvider(url, roomname, doc)`).
 * Folosim același string ca `workspaceId` din frontend pentru a izola starea per workspace.
 */
import "./env.js";
import http from "node:http";
import process from "node:process";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { WebSocketServer } from "ws";
import { createHealthPayload } from "@itecify/shared";
import { hasValidSession } from "./auth.js";

console.log("[collab] Starting…");
const require = createRequire(import.meta.url);
/** Folosește `y-websocket/bin/utils` (export oficial); `…/utils.cjs` nu e în `package.json#exports` → ESM dă ERR_PACKAGE_PATH_NOT_EXPORTED. */
const { setupWSConnection } = require("y-websocket/bin/utils");

const host = process.env.COLLAB_HOST ?? "0.0.0.0";
const port = Number(process.env.COLLAB_PORT ?? "1234");

console.log(`[collab] Binding (port ${port})…`);

const prisma = new PrismaClient();
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", setupWSConnection);

function rejectUpgrade(
  socket: Duplex,
  statusCode: number,
  message: string,
): void {
  const body = Buffer.from(message, "utf8");
  const statusText =
    statusCode === 401 ? "Unauthorized" : "Internal Server Error";
  socket.write(
    [
      `HTTP/1.1 ${statusCode} ${statusText}`,
      "Connection: close",
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${body.byteLength}`,
      "",
      message,
    ].join("\r\n"),
  );
  socket.destroy();
}

const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0] ?? "";
  if (path === "/health" || path === "/health/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(createHealthPayload("collab")));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.on("upgrade", (request, socket, head) => {
  void (async () => {
    const isAuthenticated = await hasValidSession(
      prisma,
      request.headers.cookie,
    );
    if (!isAuthenticated) {
      rejectUpgrade(socket, 401, "Authentication required.");
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  })().catch((err) => {
    console.error("[collab] Upgrade auth failed:", err);
    rejectUpgrade(socket, 500, "Failed to authorize WebSocket connection.");
  });
});

server.on("error", (err) => {
  console.error("[collab] Server error (port în uz?):", err);
  process.exit(1);
});

server.on("close", () => {
  void prisma.$disconnect();
});

server.listen(port, host, () => {
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(
    `[collab] Ready — http://${shown}:${port}  (GET /health, WebSocket Yjs)`,
  );
});
