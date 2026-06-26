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

import type { CpuSpeed } from "./constants.js";

export interface RoomPublic {
  code: RoomCode;
  hostId: PlayerId;
  players: PlayerPublic[];
  maxPlayers: number;
  started: boolean;
  cpuSpeed: CpuSpeed;
  cpuWaitingAdvance: boolean;
}

export type { CardInstance, GameView, GameResult, GameClientMessage } from "./game.js";

import type { GameClientMessage } from "./game.js";

/** クライアント → サーバー */
export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; code: RoomCode; playerName: string }
  | { type: "rejoin_room"; code: RoomCode; sessionToken: string }
  | { type: "leave_room" }
  | { type: "cycle_cpu_speed" }
  | { type: "advance_cpu" }
  | { type: "add_cpu" }
  | { type: "remove_cpu" }
  | { type: "ping" }
  | {
      type: "selection_preview";
      cardId: string | null;
      targetPlayerId: PlayerId | null;
      mode: "hover" | "selected" | "clear";
    }
  | GameClientMessage;

/** サーバー → クライアント */
export type ServerMessage =
  | { type: "room_created"; room: RoomPublic; playerId: PlayerId; sessionToken: string }
  | { type: "room_joined"; room: RoomPublic; playerId: PlayerId; sessionToken: string }
  | { type: "room_rejoined"; room: RoomPublic; playerId: PlayerId; sessionToken: string }
  | { type: "room_left" }
  | { type: "room_updated"; room: RoomPublic }
  | { type: "game_started"; room: RoomPublic }
  | { type: "game_state"; view: import("./game.js").GameView }
  | { type: "error"; message: string }
  | { type: "pong" };
