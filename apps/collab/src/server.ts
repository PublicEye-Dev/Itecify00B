import "./env.js";
import http from "node:http";
import process from "node:process";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { createHealthPayload } from "@itecify/shared";

const require = createRequire(import.meta.url);
const { setupWSConnection } = require("y-websocket/bin/utils.cjs");

const host = process.env.COLLAB_HOST ?? "0.0.0.0";
const port = Number(process.env.COLLAB_PORT ?? "1234");

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

server.listen(port, host, () => {
  console.log(`[collab] Yjs WebSocket + GET /health on http://${host}:${port}`);
});
