import { describe, expect, it } from "vitest";
import { ROOM_IDLE_TTL_MS } from "@teijitaisha/shared";
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

    expect(rm.purgeExpiredRooms(Date.now())).toBe(1);
    expect(rm.getRoomPublic(host.room.code)).toBeUndefined();
  });
});
