import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS } from "@teijitaisha/shared";
import { EffectResolver } from "./effect-resolver.js";
import type { EffectBridge, PlayerState } from "./effect-types.js";

function player(
  id: string,
  hand: PlayerState["hand"] = [],
  name = id,
): PlayerState {
  return { id, name, status: "active", hand, disconnectedAt: null };
}

function createBridge(overrides: Partial<EffectBridge> = {}): EffectBridge {
  const players = new Map<string, PlayerState>([
    ["p1", player("p1", [{ id: "h1", type: "norma" }], "1番")],
    ["p2", player("p2", [], "2番")],
    ["p3", player("p3", [{ id: "h3", type: "norma" }], "3番")],
  ]);
  const base: EffectBridge = {
    effectStep: "none",
    effectCard: null,
    effectUserId: null,
    seats: ["p1", "p2", "p3"],
    currentSeatIndex: 0,
    players,
    discardTypes: [],
    pairsRemainingThisTurn: 1,
    nomikaiBlockedPlayerId: null,
    pending: null,
    meetingDeclarations: {},
    revealedCard: null,
    peekedCards: [],
    lastTransfer: null,
    lastRoukiReveal: null,
    playerName: (id) => players.get(id)!.name,
    log: () => {},
    activePlayerIds: () => ["p1", "p2", "p3"],
    nextActiveSeat: (seat) => (seat + 1) % 3,
    seatIndexOf: (id) => ["p1", "p2", "p3"].indexOf(id),
    leftOfSeat: (seat) => (seat + 2) % 3,
    random: () => 0,
    afterEffectResolved: () => {},
    tryRetireActorAfterPair: () => false,
    markRetired: () => {},
    checkRetirement: () => false,
    endGameRouki: () => {},
    transferCard: () => {},
  };
  return { ...base, ...overrides };
}

describe("EffectResolver", () => {
  const resolver = new EffectResolver();

  it("getValidTargets: 手札0枚の相手は取引・新人教育などの対象外", () => {
    const bridge = createBridge();
    expect(resolver.getValidTargets(bridge, "p1", "torihiki")).toEqual(["p3"]);
    expect(resolver.getValidTargets(bridge, "p1", "shinjin_kyouiku")).toEqual(["p3"]);
    expect(resolver.getValidTargets(bridge, "p1", "rouki")).toEqual(["p3"]);
    expect(resolver.getValidTargets(bridge, "p1", "pawahara")).toEqual(["p3"]);
  });

  it("getValidTargets: 社内恋愛は手札0枚でも対象に含む", () => {
    const bridge = createBridge();
    expect(resolver.getValidTargets(bridge, "p1", "shanai_renai")).toEqual(["p2", "p3"]);
  });

  it("resolveSelectTarget: 入力待ちでないと不正操作", () => {
    const bridge = createBridge();
    expect(resolver.resolveSelectTarget(bridge, "p1", "p3")).toBe("不正な操作です");
  });

  it("resolveSelectTarget: 有効でない対象は選べない", () => {
    const bridge = createBridge({
      pending: {
        type: "select_target",
        playerIds: ["p1"],
        deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
        effectCard: "torihiki",
        effectUserId: "p1",
      },
    });
    expect(resolver.resolveSelectTarget(bridge, "p1", "p2")).toBe("その対象は選べません");
  });

  it("runEffect(norma): 効果解決後に afterEffectResolved が呼ばれる", () => {
    let resolved = false;
    const bridge = createBridge({
      afterEffectResolved: () => {
        resolved = true;
      },
    });
    resolver.runEffect(bridge, "norma", "p1");
    expect(resolved).toBe(true);
  });

  it("労基で残業: 即終了せず rouki_finale 待機になる", () => {
    let ended = false;
    const players = new Map<string, PlayerState>([
      ["p1", player("p1", [{ id: "h1", type: "norma" }])],
      ["p2", player("p2", [{ id: "z1", type: "zangyo" }])],
    ]);
    const bridge = createBridge({
      players,
      pending: {
        type: "select_card",
        playerIds: ["p1"],
        deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
        effectCard: "rouki",
        effectUserId: "p1",
        targetId: "p2",
      },
      endGameRouki: () => {
        ended = true;
      },
    });
    expect(resolver.resolveSelectCard(bridge, "p1", "z1")).toBeNull();
    expect(ended).toBe(false);
    expect(bridge.pending?.type).toBe("rouki_finale");
    expect(bridge.lastRoukiReveal?.cardType).toBe("zangyo");
  });
});
