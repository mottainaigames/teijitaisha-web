import { describe, expect, it } from "vitest";
import {
  buildDeck,
  dealHands,
  hasUnequalHandSizes,
  MAX_PLAYERS,
  type PlayerId,
} from "@teijitaisha/shared";
import { GameEngine } from "./game-engine.js";

function make48Players(): { id: PlayerId; name: string }[] {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    id: `p${i}`,
    name: `社員${i + 1}`,
  }));
}

function handSizes(engine: GameEngine): number[] {
  return engine.seats.map((id) => engine.players.get(id)!.hand.length);
}

describe("48人プレイ", () => {
  it("開始できる（上限ちょうど）", () => {
    const engine = new GameEngine(make48Players());
    expect(engine.start()).toBeNull();
    expect(engine.seats).toHaveLength(48);
    expect(handSizes(engine).reduce((a, b) => a + b, 0)).toBe(buildDeck().length);
  });

  it("配布: 49枚÷48人 → 1人だけ2枚・残り47人は1枚", () => {
    const ids = make48Players().map((p) => p.id);
    const { hands } = dealHands(ids, 0, () => 0, (n) => `c${n}`);
    const sizes = ids.map((id) => hands[id]!.length);
    expect(sizes.filter((s) => s === 2)).toHaveLength(1);
    expect(sizes.filter((s) => s === 1)).toHaveLength(47);
    expect(hasUnequalHandSizes(ids, hands)).toBe(true);
  });

  it("開始直後はほぼ全員ペア不可（2枚かつ同種のみ出せる）", () => {
    const engine = new GameEngine(make48Players(), () => 0);
    engine.start();
    const pairableCount = engine.seats.filter((id) => {
      const hand = engine.players.get(id)!.hand;
      if (hand.length < 2) return false;
      return hand[0]!.type === hand[1]!.type;
    }).length;
    expect(pairableCount).toBeLessThanOrEqual(1);
  });

  it("1周（全員スキップ）してもクラッシュしない", () => {
    const engine = new GameEngine(make48Players(), () => 0);
    engine.start();
    let steps = 0;
    const maxSteps = 200;
    while (engine.phase !== "game_end" && steps < maxSteps) {
      if (!engine.pending) break;
      if (engine.pending.type === "draw") {
        const drawer = engine.pending.playerIds[0]!;
        const sourceId = engine.pending.sourcePlayerId!;
        const cardId = engine.players.get(sourceId)!.hand[0]!.id;
        engine.handleAction(drawer, { type: "draw_card", cardId });
      } else if (engine.pending.type === "play_or_skip") {
        engine.handleAction(engine.pending.playerIds[0]!, { type: "skip_play" });
      } else {
        engine.tick(Date.now() + 60_000);
      }
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(engine.phase).not.toBe("game_end");
  });

  it("情報共有: 手札2枚で出した人は退社し、残り47人が選択待ち", () => {
    const engine = new GameEngine(make48Players(), () => 0);
    engine.start();
    const actor = engine.seats[0]!;
    engine.players.get(actor)!.hand = [
      { id: "jk1", type: "jouhou_kyouyu" },
      { id: "jk2", type: "jouhou_kyouyu" },
    ];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: [actor],
      deadlineAt: Date.now() + 60_000,
      effectCard: null,
      effectUserId: null,
    };
    engine.handleAction(actor, { type: "play_pair", cardType: "jouhou_kyouyu" });
    expect(engine.players.get(actor)!.status).toBe("retired");
    expect(engine.pending?.type).toBe("info_share");
    expect(engine.pending?.playerIds).toHaveLength(47);
    const ready = engine.getView(engine.seats[1]!).pending?.infoShareReady ?? {};
    expect(Object.keys(ready)).toHaveLength(47);
  });

  it("情報共有: タイムアウトで在籍者分が自動処理されカード枚数は保全される", () => {
    const engine = new GameEngine(make48Players(), () => 0);
    engine.start();
    const actor = engine.seats[0]!;
    engine.players.get(actor)!.hand = [
      { id: "jk1", type: "jouhou_kyouyu" },
      { id: "jk2", type: "jouhou_kyouyu" },
    ];
    engine.phase = "play";
    engine.pairsRemainingThisTurn = 1;
    engine.pending = {
      type: "play_or_skip",
      playerIds: [actor],
      deadlineAt: Date.now() + 60_000,
      effectCard: null,
      effectUserId: null,
    };
    engine.handleAction(actor, { type: "play_pair", cardType: "jouhou_kyouyu" });
    engine.tick(Date.now() + 60_000);
    expect(engine.pending?.type).not.toBe("info_share");
    const inHands = handSizes(engine).reduce((a, b) => a + b, 0);
    expect(inHands + engine.discardTypes.length).toBe(buildDeck().length);
  });

  it("労基・社内恋愛: 対象が複数いるときは自動選択しない", () => {
    for (const cardType of ["rouki", "shanai_renai"] as const) {
      const engine = new GameEngine(make48Players(), () => 0);
      engine.start();
      const actor = engine.seats[0]!;
      engine.players.get(actor)!.hand = [
        { id: "a1", type: cardType },
        { id: "a2", type: cardType },
      ];
      engine.phase = "play";
      engine.pairsRemainingThisTurn = 1;
      engine.pending = {
        type: "play_or_skip",
        playerIds: [actor],
        deadlineAt: Date.now() + 60_000,
        effectCard: null,
        effectUserId: null,
      };
      engine.handleAction(actor, { type: "play_pair", cardType });
      expect(engine.pending?.type).toBe("select_target");
      expect(engine.getView(actor).pending?.validTargets?.length).toBe(47);
    }
  });

  it("getView のペイロードが過大にならない（目安）", () => {
    const engine = new GameEngine(make48Players(), () => 0);
    engine.start();
    const view = engine.getView(engine.seats[0]!);
    const json = JSON.stringify(view);
    expect(view.seats).toHaveLength(48);
    expect(json.length).toBeLessThan(80_000);
  });
});
