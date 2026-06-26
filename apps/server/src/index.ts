import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { RoomCode } from "@teijitaisha/shared";
import {
  parseClientMessage,
  RoomManager,
  send,
} from "./room-manager.js";

const PORT = Number(process.env.PORT ?? 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

const roomManager = new RoomManager();
const socketRegistry = new WeakMap<WebSocket, string>();

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
  const message = JSON.stringify({ type: "room_updated", room } satisfies import("@teijitaisha/shared").ServerMessage);

  wss.clients.forEach((client) => {
    if (client.readyState !== 1) return;
    if (!socketIds.has(getSocketId(client))) return;
    client.send(message);
  });
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
        broadcastRoom(result.room.code);
        break;
      }
    }
  });

  ws.on("close", () => {
    const code = roomManager.removeSocket(id);
    if (code) {
      broadcastRoom(code);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
