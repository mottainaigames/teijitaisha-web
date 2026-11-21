import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS } from "@teijitaisha/shared";
import { GameEngine } from "./game-engine.js";
import { THREE_PLAYERS } from "./test-utils.js";

function started() {
  const engine = new GameEngine([...THREE_PLAYERS], () => 0, { seats: ["p1", "p2", "p3"], firstSeatIndex: 0 });
  expect(engine.start()).toBeNull();
  return engine;
}

function romanceOnCpu(engine: GameEngine) {
  engine.setCpuPlayerIds(new Set(["p2"]));
  engine.players.get("p1")!.hand = [
    { id: "s1", type: "shanai_renai" },
    { id: "s2", type: "shanai_renai" },
    { id: "x", type: "norma" },
  ];
  engine.players.get("p2")!.hand = [{ id: "y", type: "rouki" }];
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
  expect(engine.handleAction("p1", { type: "select_target", targetId: "p2" })).toBeNull();
  expect(engine.pending?.type).toBe("romance_view");
}

describe("CPU の行動", () => {
  it("社内恋愛の相手がCPUでも、時間切れで自動的に先へ進む", () => {
    const engine = started();
    romanceOnCpu(engine);
    // CPU はスキップを選ぶ
    expect(engine.pickRandomAction("p2")).toEqual({ type: "romance_skip" });
    expect(engine.handleAction("p2", { type: "romance_skip" })).toBeNull();
    expect(engine.pending?.type).toBe("romance_view");
    expect(engine.tick(engine.pending!.deadlineAt)).toBe(true);
    expect(engine.pending?.type).not.toBe("romance_view");
  });

  it("社内恋愛: CPUの番はCPU処理に任せ、時間切れでも二重に進めない", () => {
    const engine = started();
    romanceOnCpu(engine);
    expect(engine.tick(engine.pending!.deadlineAt + 1)).toBe(false);
  });

  it("情報共有・取引・パワハラでは残業を押し付ける", () => {
    const engine = started();
    engine.players.get("p2")!.hand = [
      { id: "a", type: "norma" },
      { id: "z", type: "zangyo" },
      { id: "b", type: "kaigi" },
    ];
    engine.pending = {
      type: "info_share",
      playerIds: ["p1", "p2", "p3"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: "jouhou_kyouyu",
      effectUserId: "p1",
    } as typeof engine.pending;
    expect(engine.pickRandomAction("p2")).toEqual({ type: "info_share_select", cardId: "z" });
    engine.pending = { ...engine.pending!, type: "trade" };
    expect(engine.pickRandomAction("p2")).toEqual({ type: "trade_select", cardId: "z" });
  });

  it("新人教育で残業を見ても手札に入れない", () => {
    const engine = started();
    engine.players.get("p2")!.hand = [{ id: "n1", type: "norma" }];
    engine.pending = {
      type: "training_take",
      playerIds: ["p2"],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: "shinjin_kyouiku",
      effectUserId: "p2",
      peekedCards: [{ id: "z", type: "zangyo" }],
    } as typeof engine.pending;
    expect(engine.pickRandomAction("p2")).toEqual({ type: "training_take", take: false });
    engine.pending = { ...engine.pending!, peekedCards: [{ id: "z", type: "zangyo" }, { id: "n2", type: "norma" }] };
    expect(engine.pickRandomAction("p2")).toEqual({ type: "training_take", take: true, cardId: "n2" });
  });
});
