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
import { logEvent } from "./logger.js";
import { parseClientMessage, RoomManager, send } from "./room-manager.js";
import { SocketRateLimiter } from "./rate-limit.js";

export interface AppOptions {
  port?: number;
  corsOrigin?: string;
}

export interface AppHandle {
  port: number;
  roomManager: RoomManager;
  close: () => Promise<void>;
}

export function createApp(options: AppOptions = {}): Promise<AppHandle> {
  const corsOrigin = options.corsOrigin ?? process.env.CORS_ORIGIN ?? "http://localhost:5173";
  const roomManager = new RoomManager();
  const createRoomLimiter = new SocketRateLimiter(8, 60_000);
  const joinRoomLimiter = new SocketRateLimiter(30, 60_000);
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
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
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
      res.end(
        JSON.stringify({
          ok: true,
          service: "teijitaisha-web-api",
          rooms: roomManager.getRoomCount(),
        }),
      );
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

  function sendToSocketId(socketId: string, message: ServerMessage): void {
    wss.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      if (getSocketId(client) !== socketId) return;
      send(client, message);
    });
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function cpuDelay(code: RoomCode, baseMs: number): Promise<void> {
    const mult = roomManager.getCpuSpeedMultiplier(code);
    if (mult === 0) {
      roomManager.setCpuWaitingAdvance(code, true);
      broadcastRoom(code);
      await roomManager.waitForCpuAdvance(code);
      roomManager.setCpuWaitingAdvance(code, false);
      broadcastRoom(code);
      return;
    }
    await delay(baseMs * mult);
  }

  async function runCpuTurns(code: RoomCode): Promise<void> {
    if (cpuRunning.has(code)) return;
    cpuRunning.add(code);

    try {
      while (roomManager.hasPendingCpu(code)) {
        const actor = roomManager.getNextCpuActor(code);
        if (!actor) break;

        roomManager.setCpuStatus(code, actor.id, actor.name, "thinking", `${actor.name} 思考中…`);
        broadcastGameState(code);
        await cpuDelay(code, CPU_THINK_MS);

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
        await cpuDelay(code, CPU_ACT_MS);

        const ok = roomManager.executePreparedCpuAction(code);
        if (!ok) {
          roomManager.clearCpuStatus(code);
          break;
        }

        if (prepared.needsEffect) {
          roomManager.setCpuStatus(code, actor.id, actor.name, "effect", "効果処理中…");
          broadcastRoom(code);
          broadcastGameState(code);
          await cpuDelay(code, CPU_EFFECT_MS);
        } else {
          await cpuDelay(code, CPU_QUICK_MS);
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

  function getWsBySocketId(targetId: string): WebSocket | undefined {
    for (const client of wss.clients) {
      if (client.readyState !== 1) continue;
      if (getSocketId(client) === targetId) return client;
    }
    return undefined;
  }

  function disconnectReplacedSession(replacedSocketId: string): void {
    const oldWs = getWsBySocketId(replacedSocketId);
    if (!oldWs) return;
    send(oldWs, {
      type: "session_replaced",
      message: "別のタブで同じプレイヤーが接続されました",
    });
    oldWs.close(4000, "session_replaced");
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
          if (!createRoomLimiter.allow(id)) {
            send(ws, { type: "error", message: "操作が多すぎます。しばらく待ってから再試行してください" });
            return;
          }
          const { room, playerId, sessionToken } = roomManager.createRoom(message.playerName, id);
          logEvent("room_created", { code: room.code, playerId });
          send(ws, { type: "room_created", room, playerId, sessionToken });
          break;
        }

        case "join_room": {
          if (!joinRoomLimiter.allow(id)) {
            send(ws, { type: "error", message: "操作が多すぎます。しばらく待ってから再試行してください" });
            return;
          }
          const result = roomManager.joinRoom(message.code, message.playerName, id, message.asObserver);
          if ("error" in result) {
            send(ws, { type: "error", message: result.error });
            return;
          }
          logEvent("room_joined", { code: result.room.code, playerId: result.playerId });
          send(ws, {
            type: "room_joined",
            room: result.room,
            playerId: result.playerId,
            sessionToken: result.sessionToken,
          });
          flushRoom(result.room.code);
          break;
        }

        case "rejoin_room": {
          const result = roomManager.rejoinRoom(message.code, message.sessionToken, id);
          if ("error" in result) {
            send(ws, { type: "error", message: result.error });
            return;
          }
          if (result.replacedSocketId) {
            disconnectReplacedSession(result.replacedSocketId);
          }
          logEvent("room_rejoined", { code: result.room.code, playerId: result.playerId });
          send(ws, {
            type: "room_rejoined",
            room: result.room,
            playerId: result.playerId,
            sessionToken: result.sessionToken,
          });
          const view = roomManager.getGameView(result.room.code, result.playerId);
          if (view) {
            send(ws, { type: "game_state", view });
          }
          flushRoom(result.room.code);
          break;
        }

        case "leave_room": {
          const result = roomManager.leaveRoom(id);
          if ("error" in result) {
            send(ws, { type: "error", message: result.error });
            return;
          }
          logEvent("room_left", { code: result.code, roomDeleted: result.roomDeleted });
          send(ws, { type: "room_left" });
          if (!result.roomDeleted) {
            flushRoom(result.code);
          }
          break;
        }

        case "return_to_lobby": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const err = roomManager.returnToLobby(ref.playerId, ref.code);
          if (err) {
            send(ws, { type: "error", message: err });
            return;
          }
          logEvent("return_to_lobby", { code: ref.code, playerId: ref.playerId });
          flushRoom(ref.code);
          break;
        }

        case "cycle_cpu_speed": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const err = roomManager.cycleCpuSpeed(ref.playerId, ref.code);
          if (err) {
            send(ws, { type: "error", message: err });
            return;
          }
          flushRoom(ref.code);
          break;
        }

        case "advance_cpu": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          if (!roomManager.advanceCpu(ref.code)) {
            send(ws, { type: "error", message: "進行待ちではありません" });
            return;
          }
          flushRoom(ref.code);
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

        case "reorder_seats": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const err = roomManager.reorderSeats(ref.playerId, ref.code, message.playerIds);
          if (err) {
            send(ws, { type: "error", message: err });
            return;
          }
          flushRoom(ref.code);
          break;
        }

        case "shuffle_seats": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const err = roomManager.shuffleSeats(ref.playerId, ref.code);
          if (err) {
            send(ws, { type: "error", message: err });
            return;
          }
          flushRoom(ref.code);
          break;
        }

        case "kick_player": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const result = roomManager.kickPlayer(ref.playerId, ref.code, message.targetPlayerId);
          if ("error" in result) {
            send(ws, { type: "error", message: result.error });
            return;
          }
          if (result.kickedSocketId) {
            sendToSocketId(result.kickedSocketId, {
              type: "room_kicked",
              message: "ホストによりルームから退出させられました",
            });
          }
          if (!result.roomDeleted) {
            flushRoom(ref.code);
          }
          break;
        }

        case "set_player_style": {
          const ref = roomManager.getSocketRef(id);
          if (!ref) {
            send(ws, { type: "error", message: "ルームに参加していません" });
            return;
          }
          const err = roomManager.setPlayerStyle(ref.playerId, ref.code, {
            nameplateBg: message.nameplateBg,
            nameColor: message.nameColor,
          });
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
          logEvent("game_started", { code: ref.code });
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
        logEvent("player_disconnected", { code });
        flushRoom(code);
      }
    });
  });

  const tickTimer = setInterval(() => {
    const now = Date.now();
    const dissolved = roomManager.purgeExpiredRooms(now);
    for (const { code, socketIds, reason } of dissolved) {
      logEvent("room_dissolved", { code, reason });
      for (const socketId of socketIds) {
        sendToSocketId(socketId, { type: "room_left" });
      }
    }

    const codes = new Set(roomManager.tickGames(now));
    for (const code of roomManager.getRoomCodesWithPendingCpu()) {
      codes.add(code);
    }
    for (const code of codes) {
      flushRoom(code);
    }
  }, 1000);

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port ?? Number(process.env.PORT ?? 8080), () => {
      const address = httpServer.address();
      const port =
        typeof address === "object" && address ? address.port : Number(process.env.PORT ?? 8080);

      logEvent("server_started", { port, corsOrigin });

      resolve({
        port,
        roomManager,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            clearInterval(tickTimer);
            wss.close((wssErr) => {
              if (wssErr) {
                rejectClose(wssErr);
                return;
              }
              httpServer.close((httpErr) => {
                if (httpErr) rejectClose(httpErr);
                else resolveClose();
              });
            });
          }),
      });
    });
  });
}
