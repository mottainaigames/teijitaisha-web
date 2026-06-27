import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS, ROOM_IDLE_TTL_MS } from "@teijitaisha/shared";
import { RoomManager } from "./room-manager.js";

describe("RoomManager rejoin", () => {
  it("切断後に同じセッションで復帰できる", () => {
    const rm = new RoomManager();

    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト1", "socket-guest1");
    if ("error" in guest) throw new Error(guest.error);
    const guest2 = rm.joinRoom(host.room.code, "ゲスト2", "socket-guest2");
    if ("error" in guest2) throw new Error(guest2.error);

    expect(rm.startGame(host.playerId, host.room.code)).toBeNull();

    rm.removeSocket("socket-guest1");
    const disconnected = rm.getRoomPublic(host.room.code)!;
    expect(disconnected.players.find((p) => p.id === guest.playerId)?.status).toBe("disconnected");

    const rejoined = rm.rejoinRoom(host.room.code, guest.sessionToken, "socket-guest1-new");
    if ("error" in rejoined) throw new Error(rejoined.error);

    expect(rejoined.playerId).toBe(guest.playerId);
    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.players.find((p) => p.id === guest.playerId)?.status).toBe("active");
    expect(rm.getSocketRef("socket-guest1-new")?.playerId).toBe(guest.playerId);
    expect(rm.getGameView(host.room.code, guest.playerId)).not.toBeNull();
  });

  it("無効なセッションは拒否する", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const result = rm.rejoinRoom(host.room.code, "invalid-token", "socket-new");
    expect(result).toEqual({ error: "セッションが無効です" });
  });

  it("ゲーム開始後も新規参加はできない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.joinRoom(host.room.code, "ゲスト1", "socket-g1");
    rm.joinRoom(host.room.code, "ゲスト2", "socket-g2");
    rm.startGame(host.playerId, host.room.code);

    const join = rm.joinRoom(host.room.code, "新規", "socket-new");
    expect(join).toEqual({ error: "ゲームはすでに開始しています" });
  });

  it("接続者がいない古いルームは掃除される", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.removeSocket("socket-host");
    rm.setLastActivityAt(host.room.code, Date.now() - ROOM_IDLE_TTL_MS - 1);

    expect(rm.purgeExpiredRooms(Date.now())).toEqual([
      { code: host.room.code, socketIds: [], reason: "idle" },
    ]);
    expect(rm.getRoomPublic(host.room.code)).toBeUndefined();
  });

  it("ホスト退出時は他の参加者にホストが継承される", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    const left = rm.leaveRoom("socket-host");
    if ("error" in left) throw new Error(left.error);

    expect(left.roomDeleted).toBe(false);
    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.hostId).toBe(guest.playerId);
  });

  it("ロビーで10分ゲームが開始されないルームは掃除される", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    rm.setLobbySinceAt(host.room.code, Date.now() - ROOM_IDLE_TTL_MS - 1);

    const dissolved = rm.purgeExpiredRooms(Date.now());
    expect(dissolved).toEqual([
      {
        code: host.room.code,
        socketIds: ["socket-host", "socket-guest"],
        reason: "lobby_timeout",
      },
    ]);
    expect(rm.getRoomPublic(host.room.code)).toBeUndefined();
  });

  it("ゲーム開始後はロビータイムアウトで掃除されない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    rm.startGame(host.playerId, host.room.code);
    rm.setLobbySinceAt(host.room.code, Date.now() - ROOM_IDLE_TTL_MS - 1);

    expect(rm.purgeExpiredRooms(Date.now())).toEqual([]);
    expect(rm.getRoomPublic(host.room.code)).toBeDefined();
  });

  it("長いプレイヤー名は正規化して保存する", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("あ".repeat(30), "socket-host");
    expect(host.room.players[0]?.name).toHaveLength(20);
  });

  it("切断20秒後は自動プレイ対象になる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);
    rm.joinRoom(host.room.code, "ゲスト2", "socket-g2");
    rm.startGame(host.playerId, host.room.code);

    rm.removeSocket("socket-guest");
    const room = rm.getRoom(host.room.code)!;
    const guestPlayer = room.players.get(guest.playerId)!;
    guestPlayer.disconnectedAt = Date.now() - IDLE_TIMEOUT_MS - 1;
    const gp = room.game!.players.get(guest.playerId)!;
    gp.disconnectedAt = guestPlayer.disconnectedAt;

    const autoIds = rm.getAutoPlayPlayerIds(room);
    expect(autoIds.has(guest.playerId)).toBe(true);
  });

  it("オブザーバーはプレイヤー人数に含まれず、開始後も参加できる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.joinRoom(host.room.code, "ゲスト", "socket-g2");
    rm.startGame(host.playerId, host.room.code);

    const observer = rm.joinRoom(host.room.code, "観戦者", "socket-obs", true);
    if ("error" in observer) throw new Error(observer.error);

    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.players.filter((p) => !p.isObserver)).toHaveLength(2);
    expect(room.players.filter((p) => p.isObserver)).toHaveLength(1);
    expect(room.started).toBe(true);

    const view = rm.getGameView(host.room.code, observer.playerId);
    expect(view?.isObserver).toBe(true);
    expect(view?.canAct).toBe(false);
    expect(Object.keys(view?.otherHands ?? {}).length).toBeGreaterThan(0);
  });

  it("復帰すると自動プレイ対象から外れる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);
    rm.joinRoom(host.room.code, "ゲスト2", "socket-g2");
    rm.startGame(host.playerId, host.room.code);

    rm.removeSocket("socket-guest");
    const room = rm.getRoom(host.room.code)!;
    const guestPlayer = room.players.get(guest.playerId)!;
    guestPlayer.disconnectedAt = Date.now() - IDLE_TIMEOUT_MS - 1;

    const rejoined = rm.rejoinRoom(host.room.code, guest.sessionToken, "socket-guest-new");
    if ("error" in rejoined) throw new Error(rejoined.error);

    expect(rm.getAutoPlayPlayerIds(room).has(guest.playerId)).toBe(false);
    expect(room.players.get(guest.playerId)?.status).toBe("active");
  });
});
