import type { CardType } from "./cards.js";

export type PlayerId = string;
export type RoomCode = string;

export type PlayerStatus = "active" | "retired" | "disconnected";

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  status: PlayerStatus;
  handCount: number;
  seatIndex: number;
}

export interface RoomPublic {
  code: RoomCode;
  hostId: PlayerId;
  players: PlayerPublic[];
  maxPlayers: number;
  started: boolean;
}

/** クライアント → サーバー */
export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; code: RoomCode; playerName: string }
  | { type: "ping" };

/** サーバー → クライアント */
export type ServerMessage =
  | { type: "room_created"; room: RoomPublic; playerId: PlayerId }
  | { type: "room_joined"; room: RoomPublic; playerId: PlayerId }
  | { type: "room_updated"; room: RoomPublic }
  | { type: "error"; message: string }
  | { type: "pong" };

/** 将来のゲーム実装用（サーバー内部） */
export interface CardInstance {
  id: string;
  type: CardType;
}
