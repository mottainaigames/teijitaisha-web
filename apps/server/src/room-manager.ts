import {
  CPU_SPEED_MULTIPLIERS,
  CPU_SPEED_ORDER,
  IDLE_TIMEOUT_MS,
  MAX_OBSERVERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizePlayerName,
  normalizePlayerColor,
  type PlayerDisplayStyle,
  formatCpuPlayerName,
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
  isObserver: boolean;
  disconnectedAt: number | null;
  /** true = ロビー画面、false = 対局中または結果画面 */
  inLobby: boolean;
  nameplateBg: string | null;
  nameColor: string | null;
}

interface Room {
  code: RoomCode;
  hostId: PlayerId;
  players: Map<PlayerId, Player>;
  maxPlayers: number;
  started: boolean;
  game: GameEngine | null;
  lastActivityAt: number;
  /** ロビー状態になった時刻（作成時・ゲーム終了後のロビー復帰時に更新） */
  lobbySinceAt: number;
  cpuSpeed: CpuSpeed;
  cpuWaitingAdvance: boolean;
  /** ゲーム終了後の inLobby 初期化を一度だけ行う */
  postGameHandled: boolean;
}

export type DissolvedRoomReason = "idle" | "lobby_timeout";

export interface DissolvedRoom {
  code: RoomCode;
  socketIds: string[];
  reason: DissolvedRoomReason;
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
  "training_peek_select",
  "training_peek_confirm",
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
      name: normalizePlayerName(playerName),
      status: "active",
      handCount: 0,
      seatIndex: 0,
      socketId,
      sessionToken,
      isCpu: false,
      isObserver: false,
      disconnectedAt: null,
      inLobby: true,
      nameplateBg: null,
      nameColor: null,
    };

    const room: Room = {
      code,
      hostId: playerId,
      players: new Map([[playerId, player]]),
      maxPlayers: MAX_PLAYERS,
      started: false,
      game: null,
      lastActivityAt: Date.now(),
      lobbySinceAt: Date.now(),
      cpuSpeed: "2x",
      cpuWaitingAdvance: false,
      postGameHandled: false,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, { code, playerId });

    return { room: this.toPublic(room), playerId, sessionToken };
  }

  joinRoom(
    code: RoomCode,
    playerName: string,
    socketId: string,
    asObserver = false,
  ): { room: RoomPublic; playerId: PlayerId; sessionToken: string } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: "ルームが見つかりません" };
    }
    if (!asObserver && this.isActiveGame(room)) {
      return { error: "ゲームはすでに開始しています" };
    }

    const playingCount = this.countPlaying(room);
    const observerCount = this.countObservers(room);

    if (asObserver) {
      if (observerCount >= MAX_OBSERVERS) {
        return { error: `オブザーバーは最大${MAX_OBSERVERS}人までです` };
      }
    } else if (playingCount >= room.maxPlayers) {
      return { error: "ルームが満員です" };
    }

    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const player: Player = {
      id: playerId,
      name: normalizePlayerName(playerName),
      status: "active",
      handCount: 0,
      seatIndex: asObserver ? playingCount + observerCount : playingCount,
      socketId,
      sessionToken,
      isCpu: false,
      isObserver: asObserver,
      disconnectedAt: null,
      inLobby: !this.isActiveGame(room),
      nameplateBg: null,
      nameColor: null,
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
      player.disconnectedAt = null;
      if (room.game) {
        const gp = room.game.players.get(player.id);
        if (gp && gp.status === "disconnected") {
          gp.status = "active";
          gp.disconnectedAt = null;
        }
        this.syncCpuIds(room);
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

    if (room.game && this.isActiveGame(room) && !player.isObserver) {
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
        .filter((p) => !p.isCpu && !p.isObserver)
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

  purgeExpiredRooms(now: number): DissolvedRoom[] {
    const toDissolve: { code: RoomCode; reason: DissolvedRoomReason }[] = [];

    for (const [code, room] of this.rooms) {
      if (!room.started && now - room.lobbySinceAt >= ROOM_IDLE_TTL_MS) {
        toDissolve.push({ code, reason: "lobby_timeout" });
        continue;
      }
      if (now - room.lastActivityAt < ROOM_IDLE_TTL_MS) continue;
      if (this.hasConnectedHuman(room)) continue;
      toDissolve.push({ code, reason: "idle" });
    }

    return toDissolve.map(({ code, reason }) => ({
      code,
      socketIds: this.dissolveRoom(code),
      reason,
    }));
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  /** @internal テスト用 */
  setLastActivityAt(code: RoomCode, at: number): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room) room.lastActivityAt = at;
  }

  /** @internal テスト用 */
  setLobbySinceAt(code: RoomCode, at: number): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room) room.lobbySinceAt = at;
  }

  private dissolveRoom(code: RoomCode): string[] {
    const room = this.rooms.get(code);
    if (!room) return [];

    const socketIds = [...room.players.values()]
      .map((p) => p.socketId)
      .filter((id): id is string => Boolean(id));

    for (const player of room.players.values()) {
      if (player.socketId) {
        this.socketToRoom.delete(player.socketId);
      }
    }
    this.resolveCpuAdvance(code);
    this.rooms.delete(code);
    return socketIds;
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
    if (room.players.get(hostId)?.isObserver) return "観戦者は操作できません";
    if (this.isActiveGame(room)) return "ゲーム開始後は追加できません";
    if (this.countPlaying(room) >= room.maxPlayers) return "ルームが満員です";

    const cpuCount = [...room.players.values()].filter((p) => p.isCpu).length;
    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name: formatCpuPlayerName(`CPU ${cpuCount + 1}`),
      status: "active",
      handCount: 0,
      seatIndex: this.countPlaying(room),
      socketId: "",
      sessionToken: "",
      isCpu: true,
      isObserver: false,
      disconnectedAt: null,
      inLobby: true,
      nameplateBg: null,
      nameColor: null,
    };
    room.players.set(playerId, player);
    this.touchRoom(room);
    return null;
  }

  removeCpu(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";
    if (this.isActiveGame(room)) return "ゲーム開始後は削除できません";

    const cpus = [...room.players.values()]
      .filter((p) => p.isCpu)
      .sort((a, b) => b.seatIndex - a.seatIndex);
    if (cpus.length === 0) return "CPUがいません";

    room.players.delete(cpus[0]!.id);
    this.reindexSeats(room);
    this.touchRoom(room);
    return null;
  }

  reorderSeats(hostId: PlayerId, code: RoomCode, playerIds: PlayerId[]): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";
    if (room.players.get(hostId)?.isObserver) return "観戦者は操作できません";
    if (this.isActiveGame(room)) return "ゲーム開始後は変更できません";

    const playing = [...room.players.values()].filter((p) => !p.isObserver);
    const expected = new Set(playing.map((p) => p.id));
    if (playerIds.length !== playing.length) return "不正な座席順です";
    if (!playerIds.every((id) => expected.has(id))) return "不正な座席順です";

    playerIds.forEach((id, index) => {
      room.players.get(id)!.seatIndex = index;
    });
    this.reindexSeats(room);
    this.touchRoom(room);
    return null;
  }

  shuffleSeats(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ操作できます";
    if (room.players.get(hostId)?.isObserver) return "観戦者は操作できません";
    if (this.isActiveGame(room)) return "ゲーム開始後は変更できません";

    const ids = [...room.players.values()]
      .filter((p) => !p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return this.reorderSeats(hostId, code, ids);
  }

  kickPlayer(
    hostId: PlayerId,
    code: RoomCode,
    targetPlayerId: PlayerId,
  ): { kickedSocketId?: string; roomDeleted: boolean } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: "ルームが見つかりません" };
    if (room.hostId !== hostId) return { error: "ホストのみ操作できます" };
    if (room.players.get(hostId)?.isObserver) return { error: "観戦者は操作できません" };
    if (this.isActiveGame(room)) return { error: "ゲーム開始後は追い出せません" };
    if (targetPlayerId === hostId) return { error: "自分自身は追い出せません" };

    const target = room.players.get(targetPlayerId);
    if (!target) return { error: "プレイヤーが見つかりません" };

    const kickedSocketId = target.socketId || undefined;
    if (target.socketId) this.socketToRoom.delete(target.socketId);
    room.players.delete(targetPlayerId);
    target.socketId = "";

    this.reindexSeats(room);

    const humansLeft = [...room.players.values()].some((p) => !p.isCpu);
    if (!humansLeft || room.players.size === 0) {
      for (const p of room.players.values()) {
        if (p.socketId) this.socketToRoom.delete(p.socketId);
      }
      this.resolveCpuAdvance(room.code);
      this.rooms.delete(room.code);
      return { kickedSocketId, roomDeleted: true };
    }

    this.touchRoom(room);
    return { kickedSocketId, roomDeleted: false };
  }

  setPlayerStyle(
    playerId: PlayerId,
    code: RoomCode,
    style: PlayerDisplayStyle,
  ): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    const player = room.players.get(playerId);
    if (!player || player.isCpu) return "変更できません";

    if (style.nameplateBg !== undefined) {
      if (style.nameplateBg != null && style.nameplateBg !== "") {
        const normalized = normalizePlayerColor(style.nameplateBg);
        if (!normalized) return "背景色の形式が正しくありません（#RGB または #RRGGBB）";
        player.nameplateBg = normalized;
      } else {
        player.nameplateBg = null;
      }
    }
    if (style.nameColor !== undefined) {
      if (style.nameColor != null && style.nameColor !== "") {
        const normalized = normalizePlayerColor(style.nameColor);
        if (!normalized) return "文字色の形式が正しくありません（#RGB または #RRGGBB）";
        player.nameColor = normalized;
      } else {
        player.nameColor = null;
      }
    }

    this.touchRoom(room);
    return null;
  }

  startGame(hostId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (room.hostId !== hostId) return "ホストのみ開始できます";
    if (room.players.get(hostId)?.isObserver) return "観戦者は開始できません";
    if (this.isActiveGame(room)) return "すでに開始しています";
    const playingCount = this.countPlaying(room);
    if (playingCount < MIN_PLAYERS) {
      return `最低${MIN_PLAYERS}人必要です`;
    }
    if (playingCount > MAX_PLAYERS) {
      return `最大${MAX_PLAYERS}人までです`;
    }

    const playing = [...room.players.values()]
      .filter((p) => !p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const humans = playing.filter((p) => !p.isCpu);
    if (this.isPostGame(room) && humans.some((p) => !p.inLobby)) {
      return "全員がルームに戻るまで開始できません";
    }

    const entries = playing.map((p) => ({ id: p.id, name: p.name }));
    const seatOrder = playing.map((p) => p.id);
    const firstSeatIndex = Math.floor(Math.random() * seatOrder.length);
    const game = new GameEngine(entries, Math.random, { seats: seatOrder, firstSeatIndex });
    const err = game.start();
    if (err) return err;

    room.game = game;
    room.started = true;
    room.postGameHandled = false;
    for (const p of room.players.values()) {
      p.inLobby = false;
    }
    this.syncHandCounts(room);
    this.touchRoom(room);
    return null;
  }

  returnToLobby(playerId: PlayerId, code: RoomCode): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return "ルームが見つかりません";
    if (!room.players.has(playerId)) return "ルームに参加していません";
    if (!this.isPostGame(room)) {
      return "ゲーム終了後にルームへ戻れます";
    }

    const player = room.players.get(playerId)!;
    player.inLobby = true;
    player.status = "active";
    player.handCount = 0;
    player.disconnectedAt = null;
    this.touchRoom(room);
    return null;
  }

  handleGameAction(playerId: PlayerId, code: RoomCode, action: GameClientMessage): string | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return "ゲームが開始されていません";
    if (room.players.get(playerId)?.isObserver) return "観戦者は操作できません";
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
    if (room?.players.get(playerId)?.isObserver) return;
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
      this.syncCpuIds(room, now);
      if (room.game.pending && now >= room.game.pending.deadlineAt) {
        const resolved = room.game.tick(now);
        if (resolved) {
          this.syncHandCounts(room);
          updated.push(room.code);
        }
      }
    }
    return updated;
  }

  getAutoPlayPlayerIds(room: Room, now = Date.now()): Set<PlayerId> {
    const ids = new Set<PlayerId>();
    for (const p of room.players.values()) {
      if (p.isCpu) {
        ids.add(p.id);
        continue;
      }
      if (
        p.status === "disconnected" &&
        p.disconnectedAt != null &&
        now - p.disconnectedAt >= IDLE_TIMEOUT_MS
      ) {
        ids.add(p.id);
      }
    }
    return ids;
  }

  getNextCpuActor(code: RoomCode, now = Date.now()): { id: PlayerId; name: string } | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game || room.game.result) return null;

    const cpuIds = this.getAutoPlayPlayerIds(room, now);
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
    const lobbyCpuIds = (ids: PlayerId[]) =>
      ids.filter((id) => cpuIds.has(id) && room.players.get(id)?.isCpu);
    switch (pending.type) {
      case "info_share":
        return [...cpuIds].filter((id) => {
          const rp = room.players.get(id);
          const gp = room.game!.players.get(id);
          return rp?.isCpu && gp?.status !== "retired" && !pending.infoShareSelections?.has(id);
        });
      case "trade":
        return pending.playerIds.filter(
          (id) => cpuIds.has(id) && room.players.get(id)?.isCpu && !pending.tradeSelections?.has(id),
        );
      default:
        return lobbyCpuIds(pending.playerIds);
    }
  }

  getGameView(code: RoomCode, playerId: PlayerId) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room?.game) return null;
    const player = room.players.get(playerId);
    if (player?.inLobby) return null;
    const base =
      player?.isObserver
        ? room.game.getObserverView(playerId)
        : room.game.getView(playerId);
    if (!base) return null;
    return {
      ...base,
      seats: base.seats.map((seat) => {
        const rp = room.players.get(seat.playerId);
        return {
          ...seat,
          nameplateBg: rp?.nameplateBg ?? undefined,
          nameColor: rp?.nameColor ?? undefined,
        };
      }),
    };
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
        if (player.isObserver) {
          // 観戦者はゲーム状態に影響しない
        } else {
          player.status = "disconnected";
          player.disconnectedAt = Date.now();
          if (room.game) {
            const gp = room.game.players.get(ref.playerId);
            if (gp) {
              gp.status = "disconnected";
              gp.disconnectedAt = player.disconnectedAt;
            }
            this.syncCpuIds(room);
          }
        }
      }
    }

    this.socketToRoom.delete(socketId);
    return ref.code;
  }

  private countPlaying(room: Room): number {
    return [...room.players.values()].filter((p) => !p.isObserver).length;
  }

  private countObservers(room: Room): number {
    return [...room.players.values()].filter((p) => p.isObserver).length;
  }

  private reindexSeats(room: Room): void {
    const playing = [...room.players.values()]
      .filter((p) => !p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    playing.forEach((p, index) => {
      p.seatIndex = index;
    });
    const observers = [...room.players.values()]
      .filter((p) => p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    observers.forEach((p, index) => {
      p.seatIndex = playing.length + index;
    });
  }

  private syncHandCounts(room: Room): void {
    if (!room.game) return;
    this.syncCpuIds(room);
    for (const p of room.players.values()) {
      if (p.isObserver) {
        p.handCount = 0;
        continue;
      }
      const gp = room.game.players.get(p.id);
      p.handCount = gp?.hand.length ?? 0;
      if (gp) p.status = gp.status;
    }
    if (room.game.phase === "game_end" && !room.postGameHandled) {
      this.enterPostGame(room);
    }
  }

  private isActiveGame(room: Room): boolean {
    return room.started && room.game != null && room.game.phase !== "game_end";
  }

  private isPostGame(room: Room): boolean {
    return room.started && room.game != null && room.game.phase === "game_end";
  }

  private enterPostGame(room: Room): void {
    room.postGameHandled = true;
    for (const p of room.players.values()) {
      p.inLobby = p.isCpu;
    }
  }

  private syncCpuIds(room: Room, now = Date.now()): void {
    if (!room.game) return;
    room.game.setCpuPlayerIds(this.getAutoPlayPlayerIds(room, now));
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
        isObserver: p.isObserver || undefined,
        inLobby: p.inLobby,
        nameplateBg: p.nameplateBg ?? undefined,
        nameColor: p.nameColor ?? undefined,
      }));

    return {
      code: room.code,
      hostId: room.hostId,
      players,
      maxPlayers: room.maxPlayers,
      started: room.started,
      postGame: this.isPostGame(room),
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
      return {
        type: "join_room",
        code: msg.code.toUpperCase(),
        playerName: msg.playerName,
        asObserver: msg.asObserver === true,
      };
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
    case "reorder_seats":
      if (!Array.isArray(msg.playerIds) || !msg.playerIds.every((id) => typeof id === "string")) {
        return null;
      }
      return { type: "reorder_seats", playerIds: msg.playerIds as string[] };
    case "shuffle_seats":
      return { type: "shuffle_seats" };
    case "kick_player":
      if (typeof msg.targetPlayerId !== "string") return null;
      return { type: "kick_player", targetPlayerId: msg.targetPlayerId };
    case "set_player_style": {
      const hasBg = "nameplateBg" in msg;
      const hasColor = "nameColor" in msg;
      if (!hasBg && !hasColor) return null;
      return {
        type: "set_player_style",
        ...(hasBg
          ? {
              nameplateBg:
                msg.nameplateBg === null
                  ? null
                  : typeof msg.nameplateBg === "string"
                    ? msg.nameplateBg
                    : undefined,
            }
          : {}),
        ...(hasColor
          ? {
              nameColor:
                msg.nameColor === null
                  ? null
                  : typeof msg.nameColor === "string"
                    ? msg.nameColor
                    : undefined,
            }
          : {}),
      };
    }
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
