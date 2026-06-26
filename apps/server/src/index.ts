import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CPU_ACT_MS,
  CPU_EFFECT_MS,
  CPU_QUICK_MS,
  CPU_THINK_MS,
  type RoomCode,
  type ServerMessage,
} from "@teijitaisha/shared";
import {
  parseClientMessage,
  RoomManager,
  send,
} from "./room-manager.js";

const PORT = Number(process.env.PORT ?? 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

const roomManager = new RoomManager();
const socketRegistry = new WeakMap<WebSocket, string>();
const cpuRunning = new Set<RoomCode>();

function getSocketId(ws: WebSocket): string {
  let id = socketRegistry.get(ws);
  if (!id) {
    id = crypto.randomUUID();
    socketRegistry.set(ws, id);
  }
  return id;
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "teijitaisha-web-api" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocketServer({ server: httpServer });

function broadcastRoom(code: RoomCode): void {
  const room = roomManager.getRoomPublic(code);
  if (!room) return;

  const socketIds = new Set(roomManager.getSocketsInRoom(code));
  const message = JSON.stringify({
    type: "room_updated",
    room,
  } satisfies ServerMessage);

  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (!socketIds.has(getSocketId(client))) return;
    client.send(message);
  });
}

function broadcastGameState(code: RoomCode): void {
  const socketIds = roomManager.getSocketsInRoom(code);
  for (const socketId of socketIds) {
    const ref = roomManager.getSocketRef(socketId);
    if (!ref) continue;
    const view = roomManager.getGameView(code, ref.playerId);
    if (!view) continue;

    wss.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      if (getSocketId(client) !== socketId) return;
      send(client, { type: "game_state", view });
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCpuTurns(code: RoomCode): Promise<void> {
  if (cpuRunning.has(code)) return;
  cpuRunning.add(code);

  try {
    while (roomManager.hasPendingCpu(code)) {
      const actor = roomManager.getNextCpuActor(code);
      if (!actor) break;

      roomManager.setCpuStatus(
        code,
        actor.id,
        actor.name,
        "thinking",
        `${actor.name} 思考中…`,
      );
      broadcastGameState(code);
      await delay(CPU_THINK_MS);

      const prepared = roomManager.prepareCpuAction(code, actor.id);
      if (!prepared) {
        roomManager.clearCpuStatus(code);
        break;
      }

      roomManager.applyCpuSelectionPreview(code);

      roomManager.setCpuStatus(
        code,
        actor.id,
        actor.name,
        "acting",
        `${actor.name} → ${prepared.preview}`,
      );
      broadcastGameState(code);
      await delay(CPU_ACT_MS);

      const ok = roomManager.executePreparedCpuAction(code);
      if (!ok) {
        roomManager.clearCpuStatus(code);
        break;
      }

      if (prepared.needsEffect) {
        roomManager.setCpuStatus(
          code,
          actor.id,
          actor.name,
          "effect",
          "効果処理中…",
        );
        broadcastRoom(code);
        broadcastGameState(code);
        await delay(CPU_EFFECT_MS);
      } else {
        await delay(CPU_QUICK_MS);
      }

      roomManager.clearCpuStatus(code);
      broadcastRoom(code);
      broadcastGameState(code);
    }
  } finally {
    cpuRunning.delete(code);
    if (roomManager.hasPendingCpu(code)) {
      void runCpuTurns(code);
    }
  }
}

function flushRoom(code: RoomCode): void {
  broadcastRoom(code);
  broadcastGameState(code);
  void runCpuTurns(code);
}

wss.on("connection", (ws) => {
  const id = getSocketId(ws);

  ws.on("message", (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "不正なメッセージです" });
      return;
    }

    const message = parseClientMessage(data);
    if (!message) {
      send(ws, { type: "error", message: "不正なメッセージです" });
      return;
    }

    switch (message.type) {
      case "ping":
        send(ws, { type: "pong" });
        break;

      case "create_room": {
        const { room, playerId } = roomManager.createRoom(message.playerName, id);
        send(ws, { type: "room_created", room, playerId });
        break;
      }

      case "join_room": {
        const result = roomManager.joinRoom(message.code, message.playerName, id);
        if ("error" in result) {
          send(ws, { type: "error", message: result.error });
          return;
        }
        send(ws, { type: "room_joined", room: result.room, playerId: result.playerId });
        flushRoom(result.room.code);
        break;
      }

      case "add_cpu": {
        const ref = roomManager.getSocketRef(id);
        if (!ref) {
          send(ws, { type: "error", message: "ルームに参加していません" });
          return;
        }
        const err = roomManager.addCpu(ref.playerId, ref.code);
        if (err) {
          send(ws, { type: "error", message: err });
          return;
        }
        flushRoom(ref.code);
        break;
      }

      case "remove_cpu": {
        const ref = roomManager.getSocketRef(id);
        if (!ref) {
          send(ws, { type: "error", message: "ルームに参加していません" });
          return;
        }
        const err = roomManager.removeCpu(ref.playerId, ref.code);
        if (err) {
          send(ws, { type: "error", message: err });
          return;
        }
        flushRoom(ref.code);
        break;
      }

      case "start_game": {
        const ref = roomManager.getSocketRef(id);
        if (!ref) {
          send(ws, { type: "error", message: "ルームに参加していません" });
          return;
        }
        const err = roomManager.startGame(ref.playerId, ref.code);
        if (err) {
          send(ws, { type: "error", message: err });
          return;
        }
        const room = roomManager.getRoomPublic(ref.code)!;
        const socketIds = new Set(roomManager.getSocketsInRoom(ref.code));
        const startedMsg = JSON.stringify({ type: "game_started", room } satisfies ServerMessage);
        wss.clients.forEach((client) => {
          if (client.readyState !== 1) return;
          if (!socketIds.has(getSocketId(client))) return;
          client.send(startedMsg);
        });
        flushRoom(ref.code);
        break;
      }

      case "selection_preview": {
        const ref = roomManager.getSocketRef(id);
        if (!ref) return;
        roomManager.handleSelectionPreview(ref.playerId, ref.code, {
          cardId: message.cardId,
          targetPlayerId: message.targetPlayerId,
          mode: message.mode,
        });
        broadcastGameState(ref.code);
        break;
      }

      default: {
        const ref = roomManager.getSocketRef(id);
        if (!ref) {
          send(ws, { type: "error", message: "ルームに参加していません" });
          return;
        }
        const err = roomManager.handleGameAction(ref.playerId, ref.code, message);
        if (err) {
          send(ws, { type: "error", message: err });
          return;
        }
        flushRoom(ref.code);
        break;
      }
    }
  });

  ws.on("close", () => {
    const code = roomManager.removeSocket(id);
    if (code) {
      flushRoom(code);
    }
  });
});

setInterval(() => {
  const codes = new Set(roomManager.tickGames(Date.now()));
  for (const code of roomManager.getRoomCodesWithPendingCpu()) {
    codes.add(code);
  }
  for (const code of codes) {
    flushRoom(code);
  }
}, 1000);

httpServer.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
