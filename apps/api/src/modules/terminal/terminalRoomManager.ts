import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import type { RawData } from "ws";
import type { WebSocket } from "ws";
import type {
  TerminalClientControlMessage,
  TerminalServerControlMessage,
} from "@itecify/shared/terminal";
import { terminalClientControlSchema } from "@itecify/shared/terminal";
import { dockerBin } from "./dockerCli.js";

const OPEN = 1;

function rawDataToBuffer(data: RawData): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return null;
}

/**
 * Cadrele text JSON de la browser ajung uneori ca `Buffer` în `ws`, nu ca `string`.
 * Fără asta, `claim_typist` / `release_typist` erau tratate ca octeți către stdin.
 */
function bufferIsClientControlJson(buf: Buffer): boolean {
  if (buf.length === 0 || buf[0] !== 0x7b /* { */) {
    return false;
  }
  let text: string;
  try {
    text = buf.toString("utf8");
  } catch {
    return false;
  }
  if (!text.trimStart().startsWith("{")) {
    return false;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return terminalClientControlSchema.safeParse(parsed).success;
  } catch {
    return false;
  }
}

type ClientMeta = {
  userId: string;
  userName: string;
};

type Room = {
  workspaceId: string;
  containerName: string;
  shell: ChildProcess | null;
  clients: Map<WebSocket, ClientMeta>;
  typistUserId: string | null;
  typistSocket: WebSocket | null;
};

const rooms = new Map<string, Room>();

/** După ultimul client, shell-ul rămâne deschis scurt timp (schimbare tab / reconectare). */
const GRACE_MS_AFTER_EMPTY = 120_000;
const emptyGraceTimers = new Map<string, NodeJS.Timeout>();

function getOrCreateRoom(workspaceId: string, containerName: string): Room {
  let room = rooms.get(workspaceId);
  if (!room) {
    room = {
      workspaceId,
      containerName,
      shell: null,
      clients: new Map(),
      typistUserId: null,
      typistSocket: null,
    };
    rooms.set(workspaceId, room);
  } else {
    room.containerName = containerName;
  }
  return room;
}

function broadcastControl(room: Room, msg: TerminalServerControlMessage): void {
  const payload = JSON.stringify(msg);
  for (const socket of room.clients.keys()) {
    if (socket.readyState === OPEN) {
      socket.send(payload);
    }
  }
}

function sendControl(socket: WebSocket, msg: TerminalServerControlMessage): void {
  if (socket.readyState === OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function broadcastBinary(room: Room, chunk: Buffer): void {
  for (const socket of room.clients.keys()) {
    if (socket.readyState === OPEN) {
      socket.send(chunk);
    }
  }
}

function killShell(room: Room): void {
  if (!room.shell) return;
  const s = room.shell;
  room.shell = null;
  try {
    s.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}

function spawnShell(room: Room): void {
  killShell(room);

  /**
   * `-i` păstrează stdin deschis pentru stream de la bridge.
   * Fără `-t`: altfel `docker exec -it` poate eșua când stdin nu e TTY al hostului (Node pipe).
   * Rutarea mesajelor WS: JSON control (string sau Buffer UTF-8 validat cu schema); altfel
   * octeți către stdin (nu ne bazăm doar pe `isBinary` — pe unele stive e incorect pentru cadre).
   */
  const child = spawn(
    dockerBin(),
    ["exec", "-i", room.containerName, "sh"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  room.shell = child;

  const onChunk = (d: Buffer): void => {
    broadcastBinary(room, d);
  };

  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);

  child.on("error", () => {
    room.shell = null;
    broadcastControl(room, {
      type: "status",
      kind: "shell_error",
      message: "Nu s-a putut porni shell-ul în container.",
    });
  });

  child.on("close", () => {
    room.shell = null;
    broadcastControl(room, {
      type: "status",
      kind: "shell_error",
      message: "Sesiunea shell s-a încheiat.",
    });
  });
}

function releaseTypist(room: Room, socket: WebSocket): void {
  if (room.typistSocket !== socket) return;
  room.typistSocket = null;
  room.typistUserId = null;
  broadcastControl(room, {
    type: "typist",
    holderUserId: null,
    holderName: null,
  });
}

function removeClient(room: Room, socket: WebSocket): void {
  releaseTypist(room, socket);
  room.clients.delete(socket);
  if (room.clients.size === 0) {
    const prev = emptyGraceTimers.get(room.workspaceId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      emptyGraceTimers.delete(room.workspaceId);
      killShell(room);
      rooms.delete(room.workspaceId);
    }, GRACE_MS_AFTER_EMPTY);
    emptyGraceTimers.set(room.workspaceId, t);
  }
}

function handleControl(
  room: Room,
  socket: WebSocket,
  raw: string,
  meta: ClientMeta,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }

  const control = terminalClientControlSchema.safeParse(parsed);
  if (!control.success) {
    return;
  }

  const msg: TerminalClientControlMessage = control.data;
  if (msg.type === "ping") {
    sendControl(socket, { type: "pong" });
    return;
  }

  if (msg.type === "release_typist") {
    releaseTypist(room, socket);
    return;
  }

  if (msg.type === "operator_broadcast") {
    if (room.typistSocket !== socket) {
      return;
    }
    broadcastBinary(room, Buffer.from(msg.text, "utf8"));
    return;
  }

  if (msg.type === "line_preview") {
    if (room.typistSocket !== socket) {
      return;
    }
    broadcastControl(room, {
      type: "line_preview",
      holderUserId: meta.userId,
      holderName: meta.userName,
      text: msg.text,
    });
    return;
  }

  if (msg.type === "command_echo") {
    if (room.typistSocket !== socket) {
      return;
    }
    broadcastControl(room, {
      type: "command_echo",
      holderUserId: meta.userId,
      holderName: meta.userName,
      line: msg.line,
    });
    return;
  }

  if (msg.type === "claim_typist") {
    if (room.typistUserId === null || room.typistUserId === meta.userId) {
      room.typistUserId = meta.userId;
      room.typistSocket = socket;
      broadcastControl(room, {
        type: "typist",
        holderUserId: meta.userId,
        holderName: meta.userName,
      });
      sendControl(socket, { type: "claim_result", ok: true });
      return;
    }

    sendControl(socket, {
      type: "claim_result",
      ok: false,
      reason: "Alt utilizator controlează terminalul.",
    });
  }
}

export function attachTerminalSocket(opts: {
  workspaceId: string;
  containerName: string;
  socket: WebSocket;
  userId: string;
  userName: string;
}): void {
  const pendingGrace = emptyGraceTimers.get(opts.workspaceId);
  if (pendingGrace) {
    clearTimeout(pendingGrace);
    emptyGraceTimers.delete(opts.workspaceId);
  }

  const room = getOrCreateRoom(opts.workspaceId, opts.containerName);
  const meta: ClientMeta = { userId: opts.userId, userName: opts.userName };
  room.clients.set(opts.socket, meta);

  sendControl(opts.socket, { type: "status", kind: "ready" });
  sendControl(opts.socket, {
    type: "typist",
    holderUserId: room.typistUserId,
    holderName: room.typistSocket
      ? (room.clients.get(room.typistSocket)?.userName ?? null)
      : null,
  });

  if (!room.shell) {
    spawnShell(room);
  }

  opts.socket.binaryType = "arraybuffer";

  opts.socket.on("message", (data: RawData) => {
    if (typeof data === "string") {
      handleControl(room, opts.socket, data, meta);
      return;
    }

    const buf = rawDataToBuffer(data);
    if (!buf || buf.length === 0) {
      return;
    }

    if (bufferIsClientControlJson(buf)) {
      handleControl(room, opts.socket, buf.toString("utf8"), meta);
      return;
    }

    if (
      room.typistSocket === opts.socket &&
      room.shell?.stdin &&
      !room.shell.stdin.destroyed
    ) {
      room.shell.stdin.write(buf);
    }
  });

  opts.socket.on("close", () => {
    removeClient(room, opts.socket);
  });

  opts.socket.on("error", () => {
    removeClient(room, opts.socket);
  });
}
