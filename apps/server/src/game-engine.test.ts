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

  it("社内恋愛: 選んだ2人が相手の手札を一定時間見られる", () => {
    const engine = createStartedEngine();
    engine.players.get("p1")!.hand = [
      { id: "s1", type: "shanai_renai" },
      { id: "s2", type: "shanai_renai" },
      { id: "p1extra", type: "norma" },
    ];
    engine.players.get("p2")!.hand = [
      { id: "p2a", type: "norma" },
      { id: "p2b", type: "rouki" },
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

    expect(engine.handleAction("p1", { type: "play_pair", cardType: "shanai_renai" })).toBeNull();
    expect(engine.pending?.type).toBe("select_target");

    expect(engine.handleAction("p1", { type: "select_target", targetId: "p2" })).toBeNull();
    expect(engine.pending?.type).toBe("romance_view");
    expect(engine.effectStep).toBe("reveal");

    const actorView = engine.getView("p1");
    expect(actorView.peekedCards.map((c) => c.id)).toEqual(["p2a", "p2b"]);
    expect(actorView.pending?.sourcePlayerId).toBe("p2");
    expect(actorView.canAct).toBe(false);

    const targetView = engine.getView("p2");
    expect(targetView.peekedCards.map((c) => c.id)).toEqual(["p1extra"]);
    expect(targetView.pending?.sourcePlayerId).toBe("p1");

    expect(engine.getView("p3").peekedCards).toEqual([]);

    const deadline = engine.pending!.deadlineAt;
    engine.tick(deadline);
    expect(engine.pending?.type).not.toBe("romance_view");
    expect(engine.getView("p1").peekedCards).toEqual([]);
  });

  it("社内恋愛: 双方がスキップすると即終了する", () => {
    const engine = createStartedEngine();
    engine.players.get("p1")!.hand = [
      { id: "s1", type: "shanai_renai" },
      { id: "s2", type: "shanai_renai" },
    ];
    engine.players.get("p2")!.hand = [{ id: "p2a", type: "norma" }];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    engine.handleAction("p1", { type: "play_pair", cardType: "shanai_renai" });
    engine.handleAction("p1", { type: "select_target", targetId: "p2" });
    expect(engine.pending?.type).toBe("romance_view");

    expect(engine.handleAction("p1", { type: "romance_skip" })).toBeNull();
    expect(engine.pending?.type).toBe("romance_view");

    expect(engine.handleAction("p2", { type: "romance_skip" })).toBeNull();
    expect(engine.pending?.type).not.toBe("romance_view");
  });

  it("社内恋愛: CPUは自動でスキップ扱い", () => {
    const engine = createStartedEngine();
    engine.setCpuPlayerIds(new Set(["p2"]));
    engine.players.get("p1")!.hand = [
      { id: "s1", type: "shanai_renai" },
      { id: "s2", type: "shanai_renai" },
    ];
    engine.players.get("p2")!.hand = [{ id: "p2a", type: "norma" }];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };

    engine.handleAction("p1", { type: "play_pair", cardType: "shanai_renai" });
    engine.handleAction("p1", { type: "select_target", targetId: "p2" });
    engine.applyRomanceCpuSkips();

    expect(engine.pending?.romanceSkips?.has("p2")).toBe(true);
    expect(engine.pending?.type).toBe("romance_view");

    expect(engine.handleAction("p1", { type: "romance_skip" })).toBeNull();
    expect(engine.pending?.type).not.toBe("romance_view");
  });

  it("引いたカードは手札のランダムな位置に挿入される", () => {
    const randomValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let ri = 0;
    const engine = new GameEngine([...THREE_PLAYERS], () => randomValues[ri++ % randomValues.length]!, {
      seats: [...FIXED_LAYOUT.seats],
      firstSeatIndex: FIXED_LAYOUT.firstSeatIndex,
    });
    engine.start();
    engine.players.get("p3")!.hand = [
      { id: "draw-me", type: "norma" },
      { id: "stay-1", type: "rouki" },
      { id: "stay-2", type: "kaigi" },
    ];
    engine.players.get("p1")!.hand = [{ id: "only", type: "norma" }];
    engine.phase = "draw";
    engine.pending = {
      type: "draw",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
      sourcePlayerId: "p3",
    };

    expect(engine.handleAction("p1", { type: "draw_card", cardId: "draw-me" })).toBeNull();
    const hand = engine.players.get("p1")!.hand;
    expect(hand).toHaveLength(2);
    expect(hand[0]!.id).toBe("draw-me");
    expect(hand[1]!.id).toBe("only");
  });

  it("手札の並べ替え: 抜かれる側は不可、シャッフルは可能", () => {
    const engine = createStartedEngine();
    engine.players.get("p1")!.hand = [
      { id: "a", type: "norma" },
      { id: "b", type: "rouki" },
      { id: "c", type: "kaigi" },
    ];
    engine.phase = "draw";
    engine.pending = {
      type: "draw",
      playerIds: ["p2"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
      sourcePlayerId: "p1",
    };

    expect(engine.shuffleHand("p1")).toBe("今は並べ替えできません");
    expect(engine.reorderHand("p1", ["c", "b", "a"])).toBe("今は並べ替えできません");

    engine.pending = {
      type: "play_or_skip",
      playerIds: ["p1"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
    };
    expect(engine.shuffleHand("p1")).toBeNull();
    expect(engine.players.get("p1")!.hand.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);

    expect(engine.reorderHand("p1", ["c", "a", "b"])).toBeNull();
    expect(engine.players.get("p1")!.hand.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("2人でも開始できる", () => {
    const engine = new GameEngine(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      () => 0,
    );
    expect(engine.start()).toBeNull();
    expect(engine.players.size).toBe(2);
  });

  it("手札枚数に差があるとき先攻は最多手札のプレイヤーから引く", () => {
    const engine = new GameEngine(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      () => 0,
    );
    expect(engine.start()).toBeNull();

    const maxHandPlayerId = [...engine.players.entries()].reduce((best, [id, p]) => {
      const bestCount = engine.players.get(best)!.hand.length;
      return p.hand.length > bestCount ? id : best;
    }, engine.seats[0]!);

    const currentId = engine.seats[engine.currentSeatIndex]!;
    const view = engine.getView(currentId);
    expect(view.pending?.type).toBe("draw");
    expect(view.pending?.sourcePlayerId).toBe(maxHandPlayerId);
  });
});
