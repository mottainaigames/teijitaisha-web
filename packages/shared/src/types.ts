export type PlayerId = string;
export type RoomCode = string;

export type PlayerStatus = "active" | "retired" | "disconnected";

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  status: PlayerStatus;
  handCount: number;
  seatIndex: number;
  isCpu?: boolean;
}

export interface RoomPublic {
  code: RoomCode;
  hostId: PlayerId;
  players: PlayerPublic[];
  maxPlayers: number;
  started: boolean;
}

export type { CardInstance, GameView, GameResult, GameClientMessage } from "./game.js";

import type { GameClientMessage } from "./game.js";

/** クライアント → サーバー */
export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; code: RoomCode; playerName: string }
  | { type: "add_cpu" }
  | { type: "remove_cpu" }
  | { type: "ping" }
  | GameClientMessage;

/** サーバー → クライアント */
export type ServerMessage =
  | { type: "room_created"; room: RoomPublic; playerId: PlayerId }
  | { type: "room_joined"; room: RoomPublic; playerId: PlayerId }
  | { type: "room_updated"; room: RoomPublic }
  | { type: "game_started"; room: RoomPublic }
  | { type: "game_state"; view: import("./game.js").GameView }
  | { type: "error"; message: string }
  | { type: "pong" };
