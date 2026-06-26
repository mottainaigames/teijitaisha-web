import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type GameClientMessage,
  type PlayerId,
  type PlayerPublic,
  type RoomCode,
  type RoomPublic,
  type ServerMessage,
} from "@teijitaisha/shared";
import { randomUUID } from "node:crypto";
import { GameEngine } from "./game-engine.js";

interface Player {
  id: PlayerId;
  name: string;
  status: "active" | "retired" | "disconnected";
  handCount: number;
  seatIndex: number;
  socketId: string;
}

interface Room {
  code: RoomCode;
  hostId: PlayerId;
  players: Map<PlayerId, Player>;
  maxPlayers: number;
  started: boolean;
  game: GameEngine | null;
}

const GAME_MESSAGE_TYPES = new Set([
  "start_game",
  "draw_card",
  "play_pair",
  "skip_play",
  "select_target",
  "select_card",
  "info_share_select",
  "trade_select",
  "training_take",
  "meeting_declare",
]);

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();
  private socketToRoom = new Map<string, { code: RoomCode; playerId: PlayerId }>();

  createRoom(playerName: string, socketId: string): { room: RoomPublic; playerId: PlayerId } {
    const code = this.generateUniqueCode();
    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name: playerName.trim() || "社員",
      status: "active",
      handCount: 0,
      seatIndex: 0,
      socketId,
    };

    const room: Room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, player]]),
      maxPlayers: MAX_PLAYERS,
      started: false,
      game: null,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, { code, playerId });

    return { room: this.toPublic(room), playerId };
  }

  joinRoom(
    code: RoomCode,
    playerName: string,
    socketId: string,
  ): { room: RoomPublic; playerId: PlayerId } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: "ルームが見つかりません" };
    }
    if (room.started) {
      return { error: "ゲームはすでに開始しています" };
    }
    if (room.players.size >= room.maxPlayers) {
      return { error: "ルームが満員です" };
    }

    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name: playerName.trim() || "社員",
      status: "active",
      handCount: 0,
      seatIndex: room.players.size,
      socketId,
    };

    room.players.set(playerId, player);
    this.socketToRoom.set(socketId, { code: room.code, playerId });

    return { room: this.toPublic(room), playerId };
  }

  startGame(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ開始できます";
    if (room.started) return "すでに開始しています";
    if (room.players.size < MIN_PLAYERS) {
      return `最低${MIN_PLAYERS}人必要です`;
    }

    const entries = [...room.players.values()].map((p) => ({ id: p.id, name: p.name }));
    const game = new GameEngine(entries);
    const err = game.start();
    if (err) return err;

    room.game = game;
    room.started = true;
    this.syncHandCounts(room);
    return null;
  }

  handleGameAction(
    playerId: PlayerId,
    code: RoomCode,
    action: GameClientMessage,
  ): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return "ゲームが開始されていません";
    const err = room.game.handleAction(playerId, action);
    if (!err) this.syncHandCounts(room);
    return err;
  }

  tickGames(now: number): RoomCode[] {
    const updated: RoomCode[] = [];
    for (const room of this.rooms.values()) {
      if (!room.game || room.game.phase === "game_end") continue;
      if (room.game.pending && now >= room.game.pending.deadlineAt) {
        room.game.tick(now);
        this.syncHandCounts(room);
        updated.push(room.code);
      }
    }
    return updated;
  }

  getGameView(code: RoomCode, playerId: PlayerId) {
    const room = this.rooms.get(code.toUpperCase());
    return room?.game?.getView(playerId) ?? null;
  }

  getRoomBySocket(socketId: string): Room | undefined {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return undefined;
    return this.rooms.get(ref.code);
  }

  getPlayerIdBySocket(socketId: string): PlayerId | undefined {
    return this.socketToRoom.get(socketId)?.playerId;
  }

  getSocketRef(socketId: string) {
    return this.socketToRoom.get(socketId);
  }

  getRoom(code: RoomCode): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  getRoomPublic(code: RoomCode): RoomPublic | undefined {
    const room = this.getRoom(code);
    return room ? this.toPublic(room) : undefined;
  }

  getSocketsInRoom(code: RoomCode): string[] {
    const room = this.getRoom(code);
    if (!room) return [];
    return [...room.players.values()].map((p) => p.socketId);
  }

  removeSocket(socketId: string): RoomCode | undefined {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return undefined;

    const room = this.rooms.get(ref.code);
    if (room) {
      const player = room.players.get(ref.playerId);
      if (player) {
        player.status = "disconnected";
        if (room.game) {
          const gp = room.game.players.get(ref.playerId);
          if (gp) gp.status = "disconnected";
        }
      }
    }

    this.socketToRoom.delete(socketId);
    return ref.code;
  }

  private syncHandCounts(room: Room): void {
    if (!room.game) return;
    for (const p of room.players.values()) {
      const gp = room.game.players.get(p.id);
      p.handCount = gp?.hand.length ?? 0;
      if (gp) p.status = gp.status;
    }
  }

  toPublic(room: Room): RoomPublic {
    const players: PlayerPublic[] = [...room.players.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        handCount: p.handCount,
        seatIndex: p.seatIndex,
      }));

    return {
      code: room.code,
      hostId: room.hostId,
      players,
      maxPlayers: room.maxPlayers,
      started: room.started,
    };
  }

  private generateUniqueCode(): RoomCode {
    let code: RoomCode;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
        ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }
}

export function parseClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== "object" || data === null || !("type" in data)) {
    return null;
  }
  const msg = data as ClientMessage;
  switch (msg.type) {
    case "ping":
      return { type: "ping" };
    case "create_room":
      if (typeof msg.playerName !== "string") return null;
      return { type: "create_room", playerName: msg.playerName };
    case "join_room":
      if (typeof msg.code !== "string" || typeof msg.playerName !== "string") return null;
      return { type: "join_room", code: msg.code.toUpperCase(), playerName: msg.playerName };
    default:
      if (GAME_MESSAGE_TYPES.has(msg.type as string)) {
        return msg as GameClientMessage;
      }
      return null;
  }
}

export function send(socket: { send: (data: string) => void }, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}
