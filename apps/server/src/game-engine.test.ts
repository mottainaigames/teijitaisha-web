import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS } from "@teijitaisha/shared";
import { GameEngine } from "./game-engine.js";
import { THREE_PLAYERS } from "./test-utils.js";

const FIXED_LAYOUT = {
  seats: ["p1", "p2", "p3"] as const,
  firstSeatIndex: 0,
};

function createStartedEngine() {
  const engine = new GameEngine([...THREE_PLAYERS], () => 0, {
    seats: [...FIXED_LAYOUT.seats],
    firstSeatIndex: FIXED_LAYOUT.firstSeatIndex,
  });
  const err = engine.start();
  expect(err).toBeNull();
  return engine;
}

function drawAndSkip(engine: GameEngine, drawerId: string, sourceId: string) {
  const source = engine.players.get(sourceId)!;
  const cardId = source.hand[0]!.id;
  expect(engine.handleAction(drawerId, { type: "draw_card", cardId })).toBeNull();
  if (engine.pending?.type === "play_or_skip") {
    expect(engine.handleAction(drawerId, { type: "skip_play" })).toBeNull();
  }
}

describe("GameEngine", () => {
  it("開始時: 先攻は左隣（前の席）から引く", () => {
    const engine = createStartedEngine();
    const view = engine.getView("p1");

    expect(view.currentPlayerId).toBe("p1");
    expect(view.pending?.type).toBe("draw");
    expect(view.pending?.sourcePlayerId).toBe("p3");
  });

  it("ターン順: 2番が1番から引き、次は3番が2番から引く", () => {
    const engine = createStartedEngine();

    drawAndSkip(engine, "p1", "p3");

    let view = engine.getView("p2");
    expect(view.currentPlayerId).toBe("p2");
    expect(view.pending?.type).toBe("draw");
    expect(view.pending?.sourcePlayerId).toBe("p1");

    drawAndSkip(engine, "p2", "p1");

    view = engine.getView("p3");
    expect(view.currentPlayerId).toBe("p3");
    expect(view.pending?.type).toBe("draw");
    expect(view.pending?.sourcePlayerId).toBe("p2");
  });

  it("ペアを出すと場にカードが捨てられる", () => {
    const engine = createStartedEngine();
    const hand = engine.players.get("p1")!;
    hand.hand = [
      { id: "n1", type: "norma" },
      { id: "n2", type: "norma" },
    ];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    expect(engine.handleAction("p1", { type: "play_pair", cardType: "norma" })).toBeNull();
    expect(engine.lastPlay?.cardType).toBe("norma");
    expect(engine.discardTypes.filter((t) => t === "norma")).toHaveLength(2);
  });

  it("飲み会デバフ中はペアを出せずターン終了する", () => {
    const engine = createStartedEngine();
    engine.nomikaiBlockedPlayerId = "p1";

    const source = engine.players.get("p3")!;
    const cardId = source.hand[0]!.id;
    expect(engine.handleAction("p1", { type: "draw_card", cardId })).toBeNull();

    expect(engine.pending?.type).toBe("draw");
    const view = engine.getView("p2");
    expect(view.currentPlayerId).toBe("p2");
    expect(engine.nomikaiBlockedPlayerId).toBeNull();
  });

  it("自分の番以外は操作できない", () => {
    const engine = createStartedEngine();
    const source = engine.players.get("p3")!;
    const cardId = source.hand[0]!.id;

    expect(engine.handleAction("p2", { type: "draw_card", cardId })).toBe(
      "あなたの番ではありません",
    );
  });

  it("情報共有: 手札2枚で出したプレイヤーは退社し、残りが交換する", () => {
    const engine = createStartedEngine();
    const actor = engine.players.get("p1")!;
    actor.hand = [
      { id: "j1", type: "jouhou_kyouyu" },
      { id: "j2", type: "jouhou_kyouyu" },
    ];
    engine.players.get("p2")!.hand = [
      { id: "p2a", type: "norma" },
      { id: "p2b", type: "rouki" },
    ];
    engine.players.get("p3")!.hand = [
      { id: "p3a", type: "norma" },
      { id: "p3b", type: "norma" },
    ];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    expect(engine.handleAction("p1", { type: "play_pair", cardType: "jouhou_kyouyu" })).toBeNull();

    expect(actor.status).toBe("retired");
    expect(actor.hand).toHaveLength(0);
    expect(engine.pending?.type).toBe("info_share");
    expect(engine.pending?.playerIds).toEqual(["p2", "p3"]);

    const p2Card = engine.players.get("p2")!.hand[0]!.id;
    const p3Card = engine.players.get("p3")!.hand[0]!.id;
    expect(engine.handleAction("p2", { type: "info_share_select", cardId: p2Card })).toBeNull();
    expect(engine.handleAction("p3", { type: "info_share_select", cardId: p3Card })).toBeNull();

    expect(engine.players.get("p1")?.status).toBe("retired");
    expect(engine.pending?.type).toBe("draw");
  });

  it("新人教育: 手札2枚で出したプレイヤーは見た後に退社する", () => {
    const engine = createStartedEngine();
    const actor = engine.players.get("p1")!;
    actor.hand = [
      { id: "s1", type: "shinjin_kyouiku" },
      { id: "s2", type: "shinjin_kyouiku" },
    ];
    engine.players.get("p2")!.hand = [
      { id: "t1", type: "norma" },
      { id: "t2", type: "rouki" },
    ];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    expect(engine.handleAction("p1", { type: "play_pair", cardType: "shinjin_kyouiku" })).toBeNull();
    expect(engine.handleAction("p1", { type: "select_target", targetId: "p2" })).toBeNull();

    expect(actor.status).toBe("retired");
    expect(actor.hand).toHaveLength(0);
    expect(engine.pending?.type).not.toBe("training_take");
  });

  it("労基: 公開カードが lastRoukiReveal に記録される", () => {
    const engine = createStartedEngine();
    const actor = engine.players.get("p1")!;
    actor.hand = [
      { id: "r1", type: "rouki" },
      { id: "r2", type: "rouki" },
      { id: "x1", type: "norma" },
    ];
    const target = engine.players.get("p2")!;
    const targetCardId = target.hand[0]!.id;
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    engine.handleAction("p1", { type: "play_pair", cardType: "rouki" });
    engine.handleAction("p1", { type: "select_target", targetId: "p2" });
    engine.handleAction("p1", { type: "select_card", cardId: targetCardId });

    expect(engine.lastRoukiReveal).not.toBeNull();
    expect(engine.lastRoukiReveal?.ownerId).toBe("p2");
    const view = engine.getView("p3");
    expect(view.lastRoukiReveal?.cardType).toBe(engine.lastRoukiReveal?.cardType);
  });
});
