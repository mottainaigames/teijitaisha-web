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

describe("RoomManager lobby seat order", () => {
  it("ホストがプレイ順を入れ替えできる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);
    const guest2 = rm.joinRoom(host.room.code, "ゲスト2", "socket-g2");
    if ("error" in guest2) throw new Error(guest2.error);

    const reordered = [guest2.playerId, guest.playerId, host.playerId];
    expect(rm.reorderSeats(host.playerId, host.room.code, reordered)).toBeNull();

    const room = rm.getRoomPublic(host.room.code)!;
    const playing = room.players.filter((p) => !p.isObserver).sort((a, b) => a.seatIndex - b.seatIndex);
    expect(playing.map((p) => p.id)).toEqual(reordered);
  });

  it("ホストがプレイ順をシャッフルできる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.joinRoom(host.room.code, "ゲスト1", "socket-g1");
    rm.joinRoom(host.room.code, "ゲスト2", "socket-g2");
    rm.joinRoom(host.room.code, "ゲスト3", "socket-g3");

    const before = rm.getRoomPublic(host.room.code)!.players
      .filter((p) => !p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => p.id);

    expect(rm.shuffleSeats(host.playerId, host.room.code)).toBeNull();

    const after = rm.getRoomPublic(host.room.code)!.players
      .filter((p) => !p.isObserver)
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => p.id);

    expect(after).toHaveLength(before.length);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it("非ホストはプレイ順を変更できない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    expect(rm.reorderSeats(guest.playerId, host.room.code, [guest.playerId, host.playerId])).toBe(
      "ホストのみ操作できます",
    );
  });

  it("ゲーム開始時にロビーの座席順が使われる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    expect(rm.reorderSeats(host.playerId, host.room.code, [guest.playerId, host.playerId])).toBeNull();
    expect(rm.startGame(host.playerId, host.room.code)).toBeNull();

    const room = rm.getRoom(host.room.code)!;
    expect(room.game?.seats).toEqual([guest.playerId, host.playerId]);
  });
});

describe("RoomManager host member management", () => {
  it("ホストがプレイヤーを追い出せる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    const result = rm.kickPlayer(host.playerId, host.room.code, guest.playerId);
    if ("error" in result) throw new Error(result.error);

    expect(result.kickedSocketId).toBe("socket-guest");
    expect(result.roomDeleted).toBe(false);
    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.players.some((p) => p.id === guest.playerId)).toBe(false);
  });

  it("プレイヤーが自分の表示色を設定できる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");

    expect(
      rm.setPlayerStyle(host.playerId, host.room.code, {
        nameplateBg: "#112233",
        nameColor: "#aabbcc",
      }),
    ).toBeNull();

    const room = rm.getRoomPublic(host.room.code)!;
    const me = room.players.find((p) => p.id === host.playerId);
    expect(me?.nameplateBg).toBe("#112233");
    expect(me?.nameColor).toBe("#aabbcc");
  });

  it("表示色は不正値を拒否し、部分更新とリセットができる", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    expect(
      rm.setPlayerStyle(guest.playerId, host.room.code, {
        nameplateBg: "red",
      }),
    ).toBe("背景色の形式が正しくありません（#RGB または #RRGGBB）");

    expect(
      rm.setPlayerStyle(guest.playerId, host.room.code, {
        nameplateBg: "#ff0000",
        nameColor: "#00ff00",
      }),
    ).toBeNull();

    expect(
      rm.setPlayerStyle(guest.playerId, host.room.code, {
        nameplateBg: "#0000ff",
      }),
    ).toBeNull();

    const room = rm.getRoomPublic(host.room.code)!;
    const g = room.players.find((p) => p.id === guest.playerId);
    expect(g?.nameplateBg).toBe("#0000ff");
    expect(g?.nameColor).toBe("#00ff00");

    expect(
      rm.setPlayerStyle(guest.playerId, host.room.code, {
        nameplateBg: null,
        nameColor: null,
      }),
    ).toBeNull();
    const reset = rm.getRoomPublic(host.room.code)!.players.find((p) => p.id === guest.playerId);
    expect(reset?.nameplateBg).toBeUndefined();
    expect(reset?.nameColor).toBeUndefined();
  });

  it("CPUは表示色を変更できない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    rm.addCpu(host.playerId, host.room.code);
    const cpu = rm.getRoomPublic(host.room.code)!.players.find((p) => p.isCpu);
    if (!cpu) throw new Error("CPU missing");

    expect(
      rm.setPlayerStyle(cpu.id, host.room.code, { nameplateBg: "#ff0000" }),
    ).toBe("変更できません");
  });

  it("非ホストは追い出しできない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);

    expect(rm.kickPlayer(guest.playerId, host.room.code, host.playerId)).toEqual({
      error: "ホストのみ操作できます",
    });
  });
});

describe("RoomManager post-game lobby", () => {
  function endGameTwoPlayers(rm: RoomManager, host: ReturnType<RoomManager["createRoom"]>) {
    const guest = rm.joinRoom(host.room.code, "ゲスト", "socket-guest");
    if ("error" in guest) throw new Error(guest.error);
    expect(rm.startGame(host.playerId, host.room.code)).toBeNull();

    const game = rm.getRoom(host.room.code)!.game!;
    game.players.get(host.playerId)!.hand = [];
    (game as unknown as { checkRetirement: () => boolean }).checkRetirement();
    expect(game.phase).toBe("game_end");

    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.postGame).toBe(true);
    expect(room.players.find((p) => p.id === host.playerId)?.inLobby).toBe(false);
    expect(room.players.find((p) => p.id === guest.playerId)?.inLobby).toBe(false);
    return guest;
  }

  it("ルームに戻るのは本人だけ（他員は結果画面のまま）", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = endGameTwoPlayers(rm, host);

    expect(rm.returnToLobby(host.playerId, host.room.code)).toBeNull();

    const room = rm.getRoomPublic(host.room.code)!;
    expect(room.postGame).toBe(true);
    expect(room.started).toBe(true);
    expect(room.players.find((p) => p.id === host.playerId)?.inLobby).toBe(true);
    expect(room.players.find((p) => p.id === guest.playerId)?.inLobby).toBe(false);
    expect(rm.getGameView(host.room.code, host.playerId)).toBeNull();
    expect(rm.getGameView(host.room.code, guest.playerId)?.phase).toBe("game_end");
  });

  it("全員がルームに戻るまで再開できない", () => {
    const rm = new RoomManager();
    const host = rm.createRoom("ホスト", "socket-host");
    const guest = endGameTwoPlayers(rm, host);

    rm.returnToLobby(host.playerId, host.room.code);
    expect(rm.startGame(host.playerId, host.room.code)).toBe(
      "全員がルームに戻るまで開始できません",
    );

    rm.returnToLobby(guest.playerId, host.room.code);
    expect(rm.startGame(host.playerId, host.room.code)).toBeNull();
    expect(rm.getRoomPublic(host.room.code)?.postGame).toBeFalsy();
  });
});
