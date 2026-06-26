import {
  MAX_PLAYERS,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type PlayerId,
  type PlayerPublic,
  type RoomCode,
  type RoomPublic,
  type ServerMessage,
} from "@teijitaisha/shared";
import { randomUUID } from "node:crypto";

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
}

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

  getRoomBySocket(socketId: string): Room | undefined {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return undefined;
    return this.rooms.get(ref.code);
  }

  getPlayerIdBySocket(socketId: string): PlayerId | undefined {
    return this.socketToRoom.get(socketId)?.playerId;
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
      }
      if (room.players.size === 0) {
        this.rooms.delete(ref.code);
      }
    }

    this.socketToRoom.delete(socketId);
    return ref.code;
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
      return null;
  }
}

export function send(socket: { send: (data: string) => void }, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}
