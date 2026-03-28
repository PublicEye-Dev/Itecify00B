/**
 * Un room Yjs = parametrul `roomname` din protocolul y-websocket (client: `WebsocketProvider(url, roomname, doc)`).
 * Folosim același string ca `workspaceId` din frontend pentru a izola starea per workspace.
 */
import "./env.js";
import http from "node:http";
import process from "node:process";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { createHealthPayload } from "@itecify/shared";

console.log("[collab] Starting…");
const require = createRequire(import.meta.url);
/** Folosește `y-websocket/bin/utils` (export oficial); `…/utils.cjs` nu e în `package.json#exports` → ESM dă ERR_PACKAGE_PATH_NOT_EXPORTED. */
const { setupWSConnection } = require("y-websocket/bin/utils");

const host = process.env.COLLAB_HOST ?? "0.0.0.0";
const port = Number(process.env.COLLAB_PORT ?? "1234");

console.log(`[collab] Binding (port ${port})…`);

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", setupWSConnection);

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
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.on("error", (err) => {
  console.error("[collab] Server error (port în uz?):", err);
  process.exit(1);
});

server.listen(port, host, () => {
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`[collab] Ready — http://${shown}:${port}  (GET /health, WebSocket Yjs)`);
});
