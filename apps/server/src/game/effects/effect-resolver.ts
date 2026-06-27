import {
  CARD_LABELS,
  IDLE_TIMEOUT_MS,
  ROUKI_ZANGYO_FINALE_MS,
  SHANAI_RENAI_VIEW_MS,
  pickRandom,
  removeCardById,
  type CardType,
  type PlayerId,
} from "@teijitaisha/shared";
import type { EffectBridge } from "./effect-types.js";

export class EffectResolver {
  runEffect(bridge: EffectBridge, cardType: CardType, userId: PlayerId): void {
    bridge.meetingDeclarations = {};
    bridge.revealedCard = null;
    bridge.peekedCards = [];

    switch (cardType) {
      case "norma":
        bridge.log("効果なし");
        bridge.afterEffectResolved();
        break;
      case "nomikai": {
        const nextSeat = bridge.nextActiveSeat(bridge.currentSeatIndex);
        bridge.nomikaiBlockedPlayerId = bridge.seats[nextSeat]!;
        bridge.log(
          `${bridge.playerName(bridge.nomikaiBlockedPlayerId)}は次のターン、ペアを出せない（飲み会）`,
        );
        bridge.afterEffectResolved();
        break;
      }
      case "enadori": {
        if (bridge.tryRetireActorAfterPair(userId, CARD_LABELS.enadori)) break;
        bridge.pairsRemainingThisTurn++;
        bridge.log(`${bridge.playerName(userId)}はもう1組ペアを出せる（エナドリ）`);
        bridge.afterEffectResolved();
        break;
      }
      case "tabako_kyuukei":
        bridge.effectStep = "tabaco_dump";
        {
          let count = 0;
          for (const id of bridge.activePlayerIds()) {
            const p = bridge.players.get(id)!;
            const tabaco = p.hand.filter((c) => c.type === "tabako_kyuukei");
            for (const c of tabaco) {
              p.hand = removeCardById(p.hand, c.id).hand;
              bridge.discardTypes.push(c.type);
              count++;
            }
          }
          bridge.log(
            count > 0
              ? `全員のタバコ休憩${count}枚が場に出された`
              : "タバコ休憩は場に出されなかった",
            "tabako_kyuukei",
          );
        }
        bridge.afterEffectResolved();
        break;
      case "kaigi":
        bridge.effectStep = "meeting_declare";
        for (const id of bridge.activePlayerIds()) {
          const p = bridge.players.get(id)!;
          const hasZangyo = p.hand.some((c) => c.type === "zangyo");
          if (hasZangyo) bridge.meetingDeclarations[id] = true;
        }
        if (Object.keys(bridge.meetingDeclarations).length > 0) {
          const names = Object.keys(bridge.meetingDeclarations)
            .map((id) => bridge.playerName(id))
            .join("、");
          bridge.log(`会議: ${names}が残業カードを持っていると宣言`, "kaigi");
        } else {
          bridge.log("会議: 残業カードの宣言者なし", "kaigi");
        }
        bridge.afterEffectResolved();
        break;
      case "jouhou_kyouyu": {
        bridge.effectStep = "info_share";
        const actor = bridge.players.get(userId)!;
        if (actor.hand.length === 0) {
          bridge.markRetired(userId);
          bridge.log(`${bridge.playerName(userId)}が情報共有のペアを出して定時退社`);
        }

        const participants = bridge.activePlayerIds();
        if (participants.length <= 1) {
          if (bridge.checkRetirement()) return;
          bridge.log("情報共有: 交換できる在籍者がいないためスキップ", "jouhou_kyouyu");
          bridge.afterEffectResolved();
          break;
        }

        bridge.log("情報共有: 在籍者が左隣に渡すカードを選ぶ", "jouhou_kyouyu");
        bridge.pending = {
          type: "info_share",
          playerIds: [...participants],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          infoShareSelections: new Map(),
        };
        break;
      }
      case "shanai_renai":
      case "shinjin_kyouiku":
      case "rouki":
        bridge.effectStep = "select_target";
        this.beginTargetSelection(bridge, userId, cardType);
        break;
      case "torihiki": {
        if (bridge.tryRetireActorAfterPair(userId, CARD_LABELS.torihiki)) break;
        bridge.effectStep = "select_target";
        this.beginTargetSelection(bridge, userId, cardType);
        break;
      }
      case "pawahara": {
        if (bridge.tryRetireActorAfterPair(userId, CARD_LABELS.pawahara)) break;
        bridge.effectStep = "select_target";
        this.beginTargetSelection(bridge, userId, cardType);
        break;
      }
    }
  }

  getValidTargets(bridge: EffectBridge, userId: PlayerId, cardType: CardType): PlayerId[] {
    const others = bridge.activePlayerIds().filter((id) => id !== userId);
    switch (cardType) {
      case "shinjin_kyouiku":
      case "rouki":
      case "pawahara":
      case "torihiki":
        return others.filter((id) => (bridge.players.get(id)?.hand.length ?? 0) > 0);
      default:
        return others;
    }
  }

  resolveSelectTarget(
    bridge: EffectBridge,
    userId: PlayerId,
    targetId: PlayerId,
  ): string | null {
    if (!bridge.pending || bridge.pending.type !== "select_target") return "不正な操作です";
    if (bridge.pending.effectUserId !== userId) return "あなたの番ではありません";
    const cardType = bridge.pending.effectCard ?? bridge.effectCard;
    if (!cardType) return "効果がありません";
    if (!this.getValidTargets(bridge, userId, cardType).includes(targetId)) {
      return "その対象は選べません";
    }

    bridge.pending.targetId = targetId;

    switch (cardType) {
      case "shanai_renai":
        bridge.effectStep = "reveal";
        bridge.log(
          `${bridge.playerName(userId)}と${bridge.playerName(targetId)}の手札がお互いに見えた（社内恋愛）`,
          "shanai_renai",
        );
        bridge.pending = {
          type: "romance_view",
          playerIds: [userId, targetId],
          deadlineAt: Date.now() + SHANAI_RENAI_VIEW_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
          romanceSkips: new Set(),
        };
        return null;
      case "shinjin_kyouiku": {
        const target = bridge.players.get(targetId)!;
        if (target.hand.length === 0) {
          bridge.afterEffectResolved();
          return null;
        }
        if (target.hand.length === 1) {
          const only = target.hand[0]!;
          bridge.effectStep = "training";
          bridge.pending = {
            type: "training_peek",
            playerIds: [userId],
            deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
            effectCard: cardType,
            effectUserId: userId,
            targetId,
            trainingPeekSelections: new Set([only.id]),
          };
          return this.finishTrainingPeek(bridge, userId);
        }
        bridge.effectStep = "training";
        bridge.peekedCards = [];
        bridge.log(
          `${bridge.playerName(userId)}が${bridge.playerName(targetId)}のカードを見る（新人教育）`,
          "shinjin_kyouiku",
        );
        bridge.pending = {
          type: "training_peek",
          playerIds: [userId],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
          trainingPeekSelections: new Set(),
        };
        return null;
      }
      case "torihiki":
        bridge.effectStep = "trade";
        bridge.log(
          `${bridge.playerName(userId)}と${bridge.playerName(targetId)}がカード交換（取引）`,
          "torihiki",
        );
        bridge.pending = {
          type: "trade",
          playerIds: [userId, targetId],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
          tradeSelections: new Map(),
        };
        return null;
      case "rouki":
      case "pawahara":
        bridge.effectStep = "select_card";
        bridge.log(
          `${bridge.playerName(userId)}が${bridge.playerName(targetId)}のカードを選ぶ（${CARD_LABELS[cardType]}）`,
          cardType,
        );
        bridge.pending = {
          type: "select_card",
          playerIds: [userId],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
        };
        return null;
      default:
        return "未対応の効果です";
    }
  }

  resolveSelectCard(bridge: EffectBridge, userId: PlayerId, cardId: string): string | null {
    if (!bridge.pending || bridge.pending.type !== "select_card") return "不正な操作です";
    if (userId !== bridge.pending.effectUserId) return "あなたの番ではありません";

    const cardType = bridge.pending.effectCard!;

    if (cardType === "pawahara") {
      const user = bridge.players.get(userId)!;
      if (!user.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
      const targetId = bridge.pending.targetId!;
      const { card, hand } = removeCardById(user.hand, cardId);
      user.hand = hand;
      bridge.players.get(targetId)!.hand.push(card);
      bridge.lastTransfer = {
        cardId: card.id,
        cardType: card.type,
        fromPlayerId: userId,
        toPlayerId: targetId,
        at: Date.now(),
      };
      bridge.log(
        `${bridge.playerName(userId)}が${CARD_LABELS[card.type]}を${bridge.playerName(targetId)}に渡した`,
        card.type,
      );
      bridge.afterEffectResolved();
      return null;
    }

    const targetId = bridge.pending.targetId!;
    const target = bridge.players.get(targetId)!;
    if (!target.hand.some((c) => c.id === cardId)) return "そのカードは選べません";

    if (cardType === "rouki") {
      const { card, hand } = removeCardById(target.hand, cardId);
      target.hand = hand;
      bridge.revealedCard = { type: card.type, ownerId: targetId };
      bridge.lastRoukiReveal = {
        cardType: card.type,
        ownerId: targetId,
        ownerName: bridge.playerName(targetId),
        actorName: bridge.playerName(userId),
        at: Date.now(),
      };

      if (card.type === "zangyo") {
        bridge.log(
          `${bridge.playerName(targetId)}の残業が摘発！${bridge.playerName(targetId)}の負け`,
          "zangyo",
        );
        bridge.effectStep = "reveal";
        bridge.pending = {
          type: "rouki_finale",
          playerIds: [],
          deadlineAt: Date.now() + ROUKI_ZANGYO_FINALE_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
        };
        return null;
      }
      if (card.type === "pawahara") {
        const user = bridge.players.get(userId)!;
        user.hand.push(card);
        bridge.log(
          `${CARD_LABELS[card.type]}が公開され、${bridge.playerName(userId)}の手札へ`,
          card.type,
        );
        bridge.afterEffectResolved();
        return null;
      }
      target.hand.push(card);
      bridge.log(
        `${CARD_LABELS[card.type]}を公開して戻した（${bridge.playerName(targetId)}）`,
        card.type,
      );
      bridge.afterEffectResolved();
      return null;
    }

    return "未対応です";
  }

  resolveInfoShare(bridge: EffectBridge, playerId: PlayerId, cardId: string): string | null {
    if (!bridge.pending || bridge.pending.type !== "info_share") return "不正な操作です";
    const p = bridge.players.get(playerId)!;
    if (!p.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
    bridge.pending.infoShareSelections!.set(playerId, cardId);
    const card = p.hand.find((c) => c.id === cardId)!;
    bridge.log(`${bridge.playerName(playerId)}が渡すカードを選択（${CARD_LABELS[card.type]}）`);
    const active = bridge.activePlayerIds();
    if ([...bridge.pending.infoShareSelections!.keys()].length >= active.length) {
      this.finishInfoShare(bridge);
    }
    return null;
  }

  resolveTrade(bridge: EffectBridge, playerId: PlayerId, cardId: string): string | null {
    if (!bridge.pending || bridge.pending.type !== "trade") return "不正な操作です";
    if (!bridge.pending.playerIds.includes(playerId)) return "参加していません";
    const p = bridge.players.get(playerId)!;
    if (!p.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
    bridge.pending.tradeSelections!.set(playerId, cardId);
    if (bridge.pending.tradeSelections!.size >= 2) {
      this.finishTrade(bridge);
    }
    return null;
  }

  resolveTrainingPeekSelect(
    bridge: EffectBridge,
    userId: PlayerId,
    cardId: string,
  ): string | null {
    if (!bridge.pending || bridge.pending.type !== "training_peek") return "不正な操作です";
    if (userId !== bridge.pending.effectUserId) return "あなたの番ではありません";
    const target = bridge.players.get(bridge.pending.targetId!);
    if (!target) return "対象が見つかりません";
    if (!target.hand.some((c) => c.id === cardId)) return "そのカードは選べません";

    const max = Math.min(2, target.hand.length);
    if (!bridge.pending.trainingPeekSelections) {
      bridge.pending.trainingPeekSelections = new Set();
    }
    const selected = bridge.pending.trainingPeekSelections;
    if (selected.has(cardId)) {
      selected.delete(cardId);
      return null;
    }
    if (selected.size >= max) return `最大${max}枚まで選べます`;
    selected.add(cardId);
    return null;
  }

  resolveTrainingPeekConfirm(bridge: EffectBridge, userId: PlayerId): string | null {
    if (!bridge.pending || bridge.pending.type !== "training_peek") return "不正な操作です";
    if (userId !== bridge.pending.effectUserId) return "あなたの番ではありません";
    const selected = bridge.pending.trainingPeekSelections;
    if (!selected?.size) return "見るカードを1枚以上選んでください";
    return this.finishTrainingPeek(bridge, userId);
  }

  resolveTrainingTake(
    bridge: EffectBridge,
    userId: PlayerId,
    take: boolean,
    cardId?: string,
  ): string | null {
    if (!bridge.pending || bridge.pending.type !== "training_take") return "不正な操作です";
    if (userId !== bridge.pending.effectUserId) return "あなたの番ではありません";
    const targetId = bridge.pending.targetId!;
    if (take && cardId) {
      const peeked = bridge.pending.peekedCards?.find((c) => c.id === cardId);
      if (!peeked) return "そのカードは選べません";
      const target = bridge.players.get(targetId)!;
      const { hand } = removeCardById(target.hand, cardId);
      target.hand = hand;
      bridge.players.get(userId)!.hand.push(peeked);
      bridge.log(
        `${bridge.playerName(userId)}が${CARD_LABELS[peeked.type]}を手札に加えた（新人教育）`,
        peeked.type,
      );
    } else {
      bridge.log(`${bridge.playerName(userId)}はカードを加えなかった（新人教育）`);
    }
    bridge.afterEffectResolved();
    return null;
  }

  skipRomanceView(bridge: EffectBridge, playerId: PlayerId): string | null {
    if (bridge.pending?.type !== "romance_view") return "スキップできません";
    if (!bridge.pending.playerIds.includes(playerId)) return "対象外です";
    if (!bridge.pending.romanceSkips) bridge.pending.romanceSkips = new Set();
    if (bridge.pending.romanceSkips.has(playerId)) return null;
    bridge.pending.romanceSkips.add(playerId);
    bridge.log(`${bridge.playerName(playerId)}が社内恋愛の確認をスキップ`, "shanai_renai");
    this.tryFinishRomanceView(bridge);
    return null;
  }

  tryFinishRomanceView(bridge: EffectBridge): void {
    if (bridge.pending?.type !== "romance_view") return;
    const skips = bridge.pending.romanceSkips ?? new Set();
    if (bridge.pending.playerIds.every((id) => skips.has(id))) {
      this.finishRomanceView(bridge, "skip");
    }
  }

  finishRomanceView(bridge: EffectBridge, reason: "skip" | "timeout"): void {
    if (bridge.pending?.type !== "romance_view") return;
    if (reason === "timeout") {
      bridge.log("社内恋愛の手札確認が終了", "shanai_renai");
    } else {
      bridge.log("社内恋愛の手札確認を双方がスキップ", "shanai_renai");
    }
    bridge.afterEffectResolved();
  }

  autoResolveSelectTarget(bridge: EffectBridge): void {
    const user = bridge.pending!.effectUserId!;
    const cardType = bridge.pending!.effectCard!;
    const targets = this.getValidTargets(bridge, user, cardType);
    if (targets.length > 0) {
      this.resolveSelectTarget(bridge, user, pickRandom(targets, bridge.random));
    } else {
      bridge.log(`${CARD_LABELS[cardType]}: 有効な対象がいないため効果をスキップ`, cardType);
      bridge.afterEffectResolved();
    }
  }

  autoResolveSelectCard(bridge: EffectBridge): void {
    const user = bridge.pending!.effectUserId!;
    const cardType = bridge.pending!.effectCard!;
    const hand =
      cardType === "pawahara"
        ? bridge.players.get(user)!.hand
        : bridge.players.get(bridge.pending!.targetId!)!.hand;
    if (hand.length === 0) {
      bridge.log(`${CARD_LABELS[cardType]}: 選べるカードがないため効果をスキップ`, cardType);
      bridge.afterEffectResolved();
      return;
    }
    const card = pickRandom(hand, bridge.random);
    this.resolveSelectCard(bridge, user, card.id);
  }

  autoResolveInfoShare(bridge: EffectBridge): void {
    for (const id of bridge.activePlayerIds()) {
      if (!bridge.pending!.infoShareSelections?.has(id)) {
        const p = bridge.players.get(id)!;
        const card = pickRandom(p.hand, bridge.random);
        bridge.pending!.infoShareSelections?.set(id, card.id);
      }
    }
    this.finishInfoShare(bridge);
  }

  autoResolveTrade(bridge: EffectBridge): void {
    for (const id of bridge.pending!.playerIds) {
      if (!bridge.pending!.tradeSelections?.has(id)) {
        const p = bridge.players.get(id)!;
        const card = pickRandom(p.hand, bridge.random);
        bridge.pending!.tradeSelections?.set(id, card.id);
      }
    }
    this.finishTrade(bridge);
  }

  autoResolveTrainingPeek(bridge: EffectBridge): void {
    const user = bridge.pending!.effectUserId!;
    const target = bridge.players.get(bridge.pending!.targetId!)!;
    const max = Math.min(2, target.hand.length);
    const selected = new Set<string>();
    const pool = [...target.hand];
    const count = Math.max(1, Math.min(max, Math.floor(bridge.random() * max) + 1));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const card = pickRandom(pool, bridge.random);
      pool.splice(pool.indexOf(card), 1);
      selected.add(card.id);
    }
    bridge.pending!.trainingPeekSelections = selected;
    this.finishTrainingPeek(bridge, user);
  }

  private beginTargetSelection(
    bridge: EffectBridge,
    userId: PlayerId,
    cardType: CardType,
  ): void {
    const targets = this.getValidTargets(bridge, userId, cardType);
    if (targets.length === 0) {
      bridge.log(`${CARD_LABELS[cardType]}: 有効な対象がいないため効果をスキップ`, cardType);
      bridge.afterEffectResolved();
      return;
    }
    bridge.pending = {
      type: "select_target",
      playerIds: [userId],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: cardType,
      effectUserId: userId,
    };
    if (targets.length === 1) {
      this.resolveSelectTarget(bridge, userId, targets[0]!);
    }
  }

  private finishInfoShare(bridge: EffectBridge): void {
    const selections = bridge.pending!.infoShareSelections!;
    const cardsToMove: { from: PlayerId; cardId: string }[] = [];
    for (const id of bridge.activePlayerIds()) {
      const cardId = selections.get(id);
      if (!cardId) continue;
      cardsToMove.push({ from: id, cardId });
    }
    for (const { from, cardId } of cardsToMove) {
      const leftSeat = bridge.leftOfSeat(bridge.seatIndexOf(from));
      const to = bridge.seats[leftSeat]!;
      if (bridge.players.get(to)?.status === "active") {
        bridge.transferCard(from, to, cardId);
      }
    }
    bridge.log("情報共有: 選んだカードが左隣へ渡された", "jouhou_kyouyu");
    bridge.afterEffectResolved();
  }

  private finishTrade(bridge: EffectBridge): void {
    const [a, b] = bridge.pending!.playerIds;
    const cardA = bridge.pending!.tradeSelections!.get(a!)!;
    const cardB = bridge.pending!.tradeSelections!.get(b!)!;
    const playerA = bridge.players.get(a!)!;
    const playerB = bridge.players.get(b!)!;
    const removedA = removeCardById(playerA.hand, cardA);
    const removedB = removeCardById(playerB.hand, cardB);
    playerA.hand = removedA.hand;
    playerB.hand = removedB.hand;
    playerA.hand.push(removedB.card);
    playerB.hand.push(removedA.card);
    bridge.log(
      `${bridge.playerName(a!)}と${bridge.playerName(b!)}が${CARD_LABELS[removedA.card.type]}と${CARD_LABELS[removedB.card.type]}を交換`,
      "torihiki",
    );
    bridge.afterEffectResolved();
  }

  private finishTrainingPeek(bridge: EffectBridge, userId: PlayerId): string | null {
    if (!bridge.pending || bridge.pending.type !== "training_peek") return "不正な操作です";
    const targetId = bridge.pending.targetId!;
    const cardType = bridge.pending.effectCard!;
    const target = bridge.players.get(targetId)!;
    const selected = bridge.pending.trainingPeekSelections ?? new Set<string>();
    bridge.peekedCards = target.hand.filter((c) => selected.has(c.id));
    bridge.log(
      `${bridge.playerName(userId)}が${bridge.playerName(targetId)}のカードを${bridge.peekedCards.length}枚見た（新人教育）`,
      "shinjin_kyouiku",
    );

    const actor = bridge.players.get(userId)!;
    if (actor.hand.length === 0) {
      bridge.markRetired(userId);
      bridge.log(`${bridge.playerName(userId)}が新人教育のペアを出して定時退社`);
      bridge.afterEffectResolved();
      return null;
    }

    bridge.pending = {
      type: "training_take",
      playerIds: [userId],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: cardType,
      effectUserId: userId,
      targetId,
      peekedCards: [...bridge.peekedCards],
    };
    return null;
  }
}
