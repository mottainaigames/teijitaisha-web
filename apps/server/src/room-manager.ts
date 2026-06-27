import {
  CPU_SPEED_MULTIPLIERS,
  CPU_SPEED_ORDER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  ROOM_IDLE_TTL_MS,
  type ClientMessage,
  type CpuSpeed,
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
  sessionToken: string;
  isCpu: boolean;
}

interface Room {
  code: RoomCode;
  hostId: PlayerId;
  players: Map<PlayerId, Player>;
  maxPlayers: number;
  started: boolean;
  game: GameEngine | null;
  lastActivityAt: number;
  cpuSpeed: CpuSpeed;
  cpuWaitingAdvance: boolean;
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
  "romance_skip",
  "shuffle_hand",
  "reorder_hand",
]);

export class RoomManager {
  private rooms = new Map<RoomCode, Room>();
  private socketToRoom = new Map<string, { code: RoomCode; playerId: PlayerId }>();
  private cpuAdvanceWaiters = new Map<RoomCode, () => void>();

  createRoom(
    playerName: string,
    socketId: string,
  ): { room: RoomPublic; playerId: PlayerId; sessionToken: string } {
    const code = this.generateUniqueCode();
    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const player: Player = {
      id: playerId,
      name: playerName.trim() || "社員",
      status: "active",
      handCount: 0,
      seatIndex: 0,
      socketId,
      sessionToken,
      isCpu: false,
    };

    const room: Room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, player]]),
      maxPlayers: MAX_PLAYERS,
      started: false,
      game: null,
      lastActivityAt: Date.now(),
      cpuSpeed: "2x",
      cpuWaitingAdvance: false,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, { code, playerId });

    return { room: this.toPublic(room), playerId, sessionToken };
  }

  joinRoom(
    code: RoomCode,
    playerName: string,
    socketId: string,
  ): { room: RoomPublic; playerId: PlayerId; sessionToken: string } | { error: string } {
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
    const sessionToken = randomUUID();
    const player: Player = {
      id: playerId,
      name: playerName.trim() || "社員",
      status: "active",
      handCount: 0,
      seatIndex: room.players.size,
      socketId,
      sessionToken,
      isCpu: false,
    };

    room.players.set(playerId, player);
    this.touchRoom(room);
    this.socketToRoom.set(socketId, { code: room.code, playerId });

    return { room: this.toPublic(room), playerId, sessionToken };
  }

  rejoinRoom(
    code: RoomCode,
    sessionToken: string,
    socketId: string,
  ):
    | { room: RoomPublic; playerId: PlayerId; sessionToken: string; replacedSocketId?: string }
    | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: "ルームが見つかりません" };
    }

    const player = [...room.players.values()].find(
      (p) => p.sessionToken === sessionToken && !p.isCpu,
    );
    if (!player) {
      return { error: "セッションが無効です" };
    }

    let replacedSocketId: string | undefined;
    if (player.socketId && player.socketId !== socketId) {
      replacedSocketId = player.socketId;
      this.socketToRoom.delete(player.socketId);
    }

    player.socketId = socketId;
    if (player.status === "disconnected") {
      player.status = "active";
      if (room.game) {
        const gp = room.game.players.get(player.id);
        if (gp && gp.status === "disconnected") {
          gp.status = "active";
        }
      }
    }

    this.socketToRoom.set(socketId, { code: room.code, playerId: player.id });
    this.touchRoom(room);

    return {
      room: this.toPublic(room),
      playerId: player.id,
      sessionToken: player.sessionToken,
      replacedSocketId,
    };
  }

  leaveRoom(socketId: string): { code: RoomCode; roomDeleted: boolean } | { error: string } {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return { error: "ルームに参加していません" };

    const room = this.rooms.get(ref.code);
    if (!room) return { error: "ルームが見つかりません" };

    const player = room.players.get(ref.playerId);
    if (!player || player.isCpu) return { error: "退出できません" };

    if (room.game && room.started) {
      const gp = room.game.players.get(ref.playerId);
      if (gp && gp.status === "active") {
        gp.status = "retired";
        gp.hand = [];
      }
    }

    room.players.delete(ref.playerId);
    this.socketToRoom.delete(socketId);
    player.socketId = "";

    if (room.hostId === ref.playerId) {
      const nextHost = [...room.players.values()]
        .filter((p) => !p.isCpu)
        .sort((a, b) => a.seatIndex - b.seatIndex)[0];
      if (nextHost) room.hostId = nextHost.id;
    }

    this.reindexSeats(room);

    const humansLeft = [...room.players.values()].some((p) => !p.isCpu);
    if (!humansLeft || room.players.size === 0) {
      for (const p of room.players.values()) {
        if (p.socketId) this.socketToRoom.delete(p.socketId);
      }
      this.resolveCpuAdvance(room.code);
      this.rooms.delete(room.code);
      return { code: ref.code, roomDeleted: true };
    }

    this.touchRoom(room);
    return { code: ref.code, roomDeleted: false };
  }

  cycleCpuSpeed(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";

    const idx = CPU_SPEED_ORDER.indexOf(room.cpuSpeed);
    room.cpuSpeed = CPU_SPEED_ORDER[(idx + 1) % CPU_SPEED_ORDER.length]!;
    this.touchRoom(room);
    return null;
  }

  getCpuSpeedMultiplier(code: RoomCode): number {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return 1;
    return CPU_SPEED_MULTIPLIERS[room.cpuSpeed];
  }

  setCpuWaitingAdvance(code: RoomCode, waiting: boolean): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room) room.cpuWaitingAdvance = waiting;
  }

  waitForCpuAdvance(code: RoomCode): Promise<void> {
    return new Promise((resolve) => {
      this.cpuAdvanceWaiters.set(code, resolve);
    });
  }

  advanceCpu(code: RoomCode): boolean {
    return this.resolveCpuAdvance(code);
  }

  private resolveCpuAdvance(code: RoomCode): boolean {
    const resolve = this.cpuAdvanceWaiters.get(code);
    if (!resolve) return false;
    this.cpuAdvanceWaiters.delete(code);
    resolve();
    return true;
  }

  purgeExpiredRooms(now: number): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivityAt < ROOM_IDLE_TTL_MS) continue;
      if (this.hasConnectedHuman(room)) continue;

      for (const player of room.players.values()) {
        if (player.socketId) {
          this.socketToRoom.delete(player.socketId);
        }
      }
      this.rooms.delete(code);
      removed++;
    }
    return removed;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  /** @internal テスト用 */
  setLastActivityAt(code: RoomCode, at: number): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room) room.lastActivityAt = at;
  }

  private hasConnectedHuman(room: Room): boolean {
    return [...room.players.values()].some((p) => !p.isCpu && p.socketId);
  }

  private touchRoom(room: Room): void {
    room.lastActivityAt = Date.now();
  }

  addCpu(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";
    if (room.started) return "ゲーム開始後は追加できません";
    if (room.players.size >= room.maxPlayers) return "ルームが満員です";

    const cpuCount = [...room.players.values()].filter((p) => p.isCpu).length;
    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name: `CPU ${cpuCount + 1}`,
      status: "active",
      handCount: 0,
      seatIndex: room.players.size,
      socketId: "",
      sessionToken: "",
      isCpu: true,
    };
    room.players.set(playerId, player);
    this.touchRoom(room);
    return null;
  }

  removeCpu(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";
    if (room.started) return "ゲーム開始後は削除できません";

    const cpus = [...room.players.values()]
      .filter((p) => p.isCpu)
      .sort((a, b) => b.seatIndex - a.seatIndex);
    if (cpus.length === 0) return "CPUがいません";

    room.players.delete(cpus[0]!.id);
    this.reindexSeats(room);
    this.touchRoom(room);
    return null;
  }

  startGame(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ開始できます";
    if (room.started) return "すでに開始しています";
    if (room.players.size < MIN_PLAYERS) {
      return `最低${MIN_PLAYERS}人必要です`;
    }
    if (room.players.size > MAX_PLAYERS) {
      return `最大${MAX_PLAYERS}人までです`;
    }

    const entries = [...room.players.values()].map((p) => ({ id: p.id, name: p.name }));
    const game = new GameEngine(entries);
    const err = game.start();
    if (err) return err;

    room.game = game;
    room.started = true;
    this.syncHandCounts(room);
    this.touchRoom(room);
    return null;
  }

  returnToLobby(playerId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (!room.players.has(playerId)) return "ルームに参加していません";
    if (!room.started || !room.game || room.game.phase !== "game_end") {
      return "ゲーム終了後にルームへ戻れます";
    }

    room.game = null;
    room.started = false;
    room.cpuWaitingAdvance = false;
    this.resolveCpuAdvance(room.code);

    for (const p of room.players.values()) {
      p.status = "active";
      p.handCount = 0;
    }

    this.touchRoom(room);
    return null;
  }

  handleGameAction(playerId: PlayerId, code: RoomCode, action: GameClientMessage): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return "ゲームが開始されていません";
    this.syncCpuIds(room);
    const err = room.game.handleAction(playerId, action);
    if (!err) {
      room.game.applyRomanceCpuSkips();
      this.syncHandCounts(room);
      this.touchRoom(room);
    }
    return err;
  }

  handleSelectionPreview(
    playerId: PlayerId,
    code: RoomCode,
    preview: {
      cardId: string | null;
      targetPlayerId: PlayerId | null;
      mode: "hover" | "selected" | "clear";
    },
  ): void {
    const room = this.rooms.get(code.toUpperCase());
    room?.game?.setSelectionPreview(playerId, preview);
  }

  applyCpuSelectionPreview(code: RoomCode): void {
    const room = this.rooms.get(code.toUpperCase());
    room?.game?.applyPlannedSelectionPreview();
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

  getNextCpuActor(code: RoomCode): { id: PlayerId; name: string } | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game || room.game.result) return null;

    const cpuIds = new Set([...room.players.values()].filter((p) => p.isCpu).map((p) => p.id));
    if (cpuIds.size === 0) return null;

    const actors = this.getPendingCpuActors(room, cpuIds);
    if (actors.length === 0) return null;

    const id = actors[0]!;
    const name = room.players.get(id)?.name ?? room.game.players.get(id)?.name ?? "CPU";
    return { id, name };
  }

  prepareCpuAction(
    code: RoomCode,
    playerId: PlayerId,
  ): { preview: string; needsEffect: boolean } | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return null;
    return room.game.prepareCpuAction(playerId);
  }

  executePreparedCpuAction(code: RoomCode): boolean {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return false;
    this.syncCpuIds(room);
    const err = room.game.executePreparedCpuAction();
    if (!err) {
      room.game.applyRomanceCpuSkips();
      this.syncHandCounts(room);
    }
    return !err;
  }

  setCpuStatus(
    code: RoomCode,
    playerId: PlayerId,
    playerName: string,
    step: "thinking" | "acting" | "effect",
    message: string,
  ): void {
    const room = this.rooms.get(code.toUpperCase());
    room?.game?.setCpuStatus(playerId, playerName, step, message);
  }

  clearCpuStatus(code: RoomCode): void {
    const room = this.rooms.get(code.toUpperCase());
    room?.game?.clearCpuStatus();
  }

  hasPendingCpu(code: RoomCode): boolean {
    return this.getNextCpuActor(code) !== null;
  }

  getRoomCodesWithPendingCpu(): RoomCode[] {
    const codes: RoomCode[] = [];
    for (const room of this.rooms.values()) {
      if (this.hasPendingCpu(room.code)) codes.push(room.code);
    }
    return codes;
  }

  private getPendingCpuActors(room: Room, cpuIds: Set<PlayerId>): PlayerId[] {
    const pending = room.game!.pending!;
    switch (pending.type) {
      case "info_share":
        return [...cpuIds].filter((id) => {
          const gp = room.game!.players.get(id);
          return gp?.status === "active" && !pending.infoShareSelections?.has(id);
        });
      case "trade":
        return pending.playerIds.filter(
          (id) => cpuIds.has(id) && !pending.tradeSelections?.has(id),
        );
      default:
        return pending.playerIds.filter((id) => cpuIds.has(id));
    }
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
    return [...room.players.values()].filter((p) => !p.isCpu && p.socketId).map((p) => p.socketId);
  }

  removeSocket(socketId: string): RoomCode | undefined {
    const ref = this.socketToRoom.get(socketId);
    if (!ref) return undefined;

    const room = this.rooms.get(ref.code);
    if (room) {
      const player = room.players.get(ref.playerId);
      if (player && !player.isCpu) {
        player.socketId = "";
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

  private reindexSeats(room: Room): void {
    const sorted = [...room.players.values()].sort((a, b) => a.seatIndex - b.seatIndex);
    sorted.forEach((p, index) => {
      p.seatIndex = index;
    });
  }

  private syncHandCounts(room: Room): void {
    if (!room.game) return;
    this.syncCpuIds(room);
    for (const p of room.players.values()) {
      const gp = room.game.players.get(p.id);
      p.handCount = gp?.hand.length ?? 0;
      if (gp) p.status = gp.status;
    }
  }

  private syncCpuIds(room: Room): void {
    if (!room.game) return;
    const cpuIds = new Set(
      [...room.players.values()].filter((p) => p.isCpu).map((p) => p.id),
    );
    room.game.setCpuPlayerIds(cpuIds);
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
        isCpu: p.isCpu || undefined,
      }));

    return {
      code: room.code,
      hostId: room.hostId,
      players,
      maxPlayers: room.maxPlayers,
      started: room.started,
      cpuSpeed: room.cpuSpeed,
      cpuWaitingAdvance: room.cpuWaitingAdvance,
    };
  }

  private generateUniqueCode(): RoomCode {
    let code: RoomCode;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)],
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
    case "rejoin_room":
      if (typeof msg.code !== "string" || typeof msg.sessionToken !== "string") return null;
      return { type: "rejoin_room", code: msg.code.toUpperCase(), sessionToken: msg.sessionToken };
    case "leave_room":
      return { type: "leave_room" };
    case "return_to_lobby":
      return { type: "return_to_lobby" };
    case "cycle_cpu_speed":
      return { type: "cycle_cpu_speed" };
    case "advance_cpu":
      return { type: "advance_cpu" };
    case "shuffle_hand":
      return { type: "shuffle_hand" };
    case "reorder_hand":
      if (!Array.isArray(msg.cardIds) || !msg.cardIds.every((id) => typeof id === "string")) {
        return null;
      }
      return { type: "reorder_hand", cardIds: msg.cardIds as string[] };
    case "add_cpu":
      return { type: "add_cpu" };
    case "remove_cpu":
      return { type: "remove_cpu" };
    case "selection_preview":
      if (!("mode" in msg)) return null;
      return {
        type: "selection_preview",
        cardId: typeof msg.cardId === "string" ? msg.cardId : null,
        targetPlayerId: typeof msg.targetPlayerId === "string" ? msg.targetPlayerId : null,
        mode: msg.mode as "hover" | "selected" | "clear",
      };
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
