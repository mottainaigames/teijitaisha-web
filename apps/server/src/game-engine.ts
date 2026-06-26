import {
  CARD_LABELS,
  IDLE_TIMEOUT_MS,
  MIN_PLAYERS,
  type CardType,
  dealHands,
  getPairableTypes,
  pickRandom,
  removeCardById,
  removeCardsByType,
  type CardInstance,
  type EffectStep,
  type GamePhase,
  type GameResult,
  type GameView,
  type PendingInputType,
  type PendingView,
  type PlayerId,
} from "@teijitaisha/shared";
import { randomUUID } from "node:crypto";

interface PlayerState {
  id: PlayerId;
  name: string;
  status: "active" | "retired" | "disconnected";
  hand: CardInstance[];
}

interface PendingInput {
  type: PendingInputType;
  playerIds: PlayerId[];
  deadlineAt: number;
  effectCard: CardType | null;
  effectUserId: PlayerId | null;
  targetId?: PlayerId;
  peekedCards?: CardInstance[];
  infoShareSelections?: Map<PlayerId, string>;
  tradeSelections?: Map<PlayerId, string>;
  sourcePlayerId?: PlayerId;
}

export class GameEngine {
  phase: GamePhase = "lobby";
  effectStep: EffectStep = "none";
  effectCard: CardType | null = null;
  effectUserId: PlayerId | null = null;

  seats: PlayerId[] = [];
  currentSeatIndex = 0;
  firstPlayerSeatIndex = 0;

  players = new Map<PlayerId, PlayerState>();
  discardTypes: CardType[] = [];
  pairsRemainingThisTurn = 1;
  nomikaiBlockedPlayerId: PlayerId | null = null;

  pending: PendingInput | null = null;
  result: GameResult | null = null;

  revealedCard: { type: CardType; ownerId: PlayerId } | null = null;
  meetingDeclarations: Record<PlayerId, boolean> = {};
  peekedCards: CardInstance[] = [];

  private readonly random: () => number;

  constructor(
    entries: { id: PlayerId; name: string }[],
    random: () => number = Math.random,
  ) {
    this.random = random;
    for (const e of entries) {
      this.players.set(e.id, {
        id: e.id,
        name: e.name,
        status: "active",
        hand: [],
      });
    }
  }

  start(): string | null {
    if (this.players.size < MIN_PLAYERS) {
      return `最低${MIN_PLAYERS}人必要です`;
    }
    this.seats = [...this.players.keys()];
    // 座席シャッフル
    for (let i = this.seats.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.seats[i], this.seats[j]] = [this.seats[j]!, this.seats[i]!];
    }

    this.firstPlayerSeatIndex = Math.floor(this.random() * this.seats.length);
    this.currentSeatIndex = this.firstPlayerSeatIndex;

    const { hands } = dealHands(this.seats, this.firstPlayerSeatIndex, this.random, () =>
      randomUUID(),
    );
    for (const [id, hand] of Object.entries(hands)) {
      const p = this.players.get(id as PlayerId);
      if (p) p.hand = hand;
    }

    this.phase = "draw";
    this.pairsRemainingThisTurn = 1;
    this.nomikaiBlockedPlayerId = null;
    this.beginDrawPhase();
    return null;
  }

  handleAction(playerId: PlayerId, action: { type: string; [key: string]: unknown }): string | null {
    if (this.phase === "game_end") return "ゲームは終了しています";
    if (!this.pending) return "入力待ちではありません";

    switch (this.pending.type) {
      case "draw":
        if (action.type !== "draw_card") return "カードを選んでください";
        return this.resolveDraw(playerId, action.cardId as string);
      case "play_or_skip":
        if (action.type === "skip_play") return this.resolveSkipPlay(playerId);
        if (action.type === "play_pair") return this.resolvePlayPair(playerId, action.cardType as CardType);
        return "ペアを出すかスキップしてください";
      case "select_target":
        if (action.type !== "select_target") return "対象を選んでください";
        return this.resolveSelectTarget(playerId, action.targetId as PlayerId);
      case "select_card":
        if (action.type !== "select_card") return "カードを選んでください";
        return this.resolveSelectCard(playerId, action.cardId as string);
      case "info_share":
        if (action.type !== "info_share_select") return "カードを選んでください";
        return this.resolveInfoShare(playerId, action.cardId as string);
      case "trade":
        if (action.type !== "trade_select") return "カードを選んでください";
        return this.resolveTrade(playerId, action.cardId as string);
      case "training_take":
        if (action.type !== "training_take") return "選択してください";
        return this.resolveTrainingTake(
          playerId,
          action.take as boolean,
          action.cardId as string | undefined,
        );
      default:
        return "未対応の入力です";
    }
  }

  tick(now: number): void {
    if (!this.pending || now < this.pending.deadlineAt) return;
    this.autoResolve();
  }

  /** CPU 用: 有効ならランダム行動、なければスキップ相当の操作 */
  actRandom(playerId: PlayerId): string | null {
    const action = this.pickRandomAction(playerId);
    if (!action) return "行動できません";
    return this.handleAction(playerId, action);
  }

  pickRandomAction(playerId: PlayerId): { type: string; [key: string]: unknown } | null {
    if (!this.pending || this.phase === "game_end") return null;

    const p = this.pending;

    switch (p.type) {
      case "draw": {
        if (playerId !== p.playerIds[0]) return null;
        const source = this.players.get(p.sourcePlayerId!);
        if (!source?.hand.length) return null;
        const card = pickRandom(source.hand, this.random);
        return { type: "draw_card", cardId: card.id };
      }
      case "play_or_skip": {
        if (playerId !== p.playerIds[0]) return null;
        const player = this.players.get(playerId)!;
        const pairable = getPairableTypes(player.hand);
        const options: { type: string; [key: string]: unknown }[] = [{ type: "skip_play" }];
        for (const cardType of pairable) {
          options.push({ type: "play_pair", cardType });
        }
        return pickRandom(options, this.random);
      }
      case "select_target": {
        if (playerId !== p.effectUserId) return null;
        const targets = this.getValidTargets(playerId, p.effectCard ?? this.effectCard!);
        if (targets.length === 0) return null;
        return { type: "select_target", targetId: pickRandom(targets, this.random) };
      }
      case "select_card": {
        if (playerId !== p.effectUserId) return null;
        const cardIds = this.getSelectableCardIds(playerId);
        if (cardIds.length === 0) return null;
        return { type: "select_card", cardId: pickRandom(cardIds, this.random) };
      }
      case "info_share": {
        const player = this.players.get(playerId);
        if (!player || player.status !== "active") return null;
        if (p.infoShareSelections?.has(playerId)) return null;
        if (!player.hand.length) return null;
        const card = pickRandom(player.hand, this.random);
        return { type: "info_share_select", cardId: card.id };
      }
      case "trade": {
        if (!p.playerIds.includes(playerId)) return null;
        if (p.tradeSelections?.has(playerId)) return null;
        const player = this.players.get(playerId);
        if (!player?.hand.length) return null;
        const card = pickRandom(player.hand, this.random);
        return { type: "trade_select", cardId: card.id };
      }
      case "training_take": {
        if (playerId !== p.effectUserId) return null;
        const peeked = p.peekedCards ?? [];
        const options: { type: string; [key: string]: unknown }[] = [{ type: "training_take", take: false }];
        for (const card of peeked) {
          options.push({ type: "training_take", take: true, cardId: card.id });
        }
        return pickRandom(options, this.random);
      }
      default:
        return null;
    }
  }

  private getSelectableCardIds(_playerId: PlayerId): string[] {
    if (!this.pending || this.pending.type !== "select_card") return [];
    const p = this.pending;
    if (p.effectCard === "pawahara") {
      return this.players.get(p.effectUserId!)?.hand.map((c) => c.id) ?? [];
    }
    if (p.targetId) {
      return this.players.get(p.targetId)?.hand.map((c) => c.id) ?? [];
    }
    return [];
  }

  getView(forPlayerId: PlayerId): GameView {
    const me = this.players.get(forPlayerId);
    const currentId = this.seats[this.currentSeatIndex] ?? null;
    const pendingView = this.buildPendingView(forPlayerId);

    const drawableHands: Record<PlayerId, { id: string }[]> = {};
    if (this.pending?.type === "draw" && currentId === forPlayerId && this.pending.sourcePlayerId) {
      const source = this.players.get(this.pending.sourcePlayerId);
      if (source) {
        drawableHands[source.id] = source.hand.map((c) => ({ id: c.id }));
      }
    }

    return {
      phase: this.phase,
      seats: this.seats.map((id, seatIndex) => {
        const p = this.players.get(id)!;
        return {
          playerId: id,
          name: p.name,
          status: p.status,
          handCount: p.hand.length,
          seatIndex,
        };
      }),
      currentPlayerId: currentId,
      myPlayerId: forPlayerId,
      myHand: me ? [...me.hand] : [],
      drawableHands,
      discardTypes: [...this.discardTypes],
      pairsRemainingThisTurn: this.pairsRemainingThisTurn,
      nomikaiBlocked: this.nomikaiBlockedPlayerId === forPlayerId,
      effectCard: this.effectCard,
      effectStep: this.effectStep,
      pending: pendingView,
      result: this.result,
      revealedCard: this.revealedCard,
      meetingDeclarations: { ...this.meetingDeclarations },
      peekedCards: forPlayerId === this.effectUserId ? [...this.peekedCards] : [],
      canAct: this.pending?.playerIds.includes(forPlayerId) ?? false,
      deadlineAt: this.pending?.deadlineAt ?? null,
    };
  }

  private buildPendingView(forPlayerId: PlayerId): PendingView | null {
    if (!this.pending) return null;
    const p = this.pending;
    const view: PendingView = {
      type: p.type,
      playerIds: [...p.playerIds],
      sourcePlayerId: p.sourcePlayerId,
    };

    if (p.type === "select_target") {
      view.validTargets = this.getValidTargets(p.effectUserId!, p.effectCard!);
    }
    if (p.type === "select_card") {
      if (p.effectCard === "pawahara") {
        const user = this.players.get(p.effectUserId!);
        view.validCardIds = user?.hand.map((c) => c.id);
      } else if (p.targetId) {
        const target = this.players.get(p.targetId);
        view.validCardIds = target?.hand.map((c) => c.id);
        view.sourcePlayerId = p.targetId;
      }
    }
    if (p.type === "trade") {
      view.tradeReady = {};
      for (const id of p.playerIds) {
        view.tradeReady[id] = p.tradeSelections?.has(id) ?? false;
      }
    }
    if (p.type === "info_share") {
      view.infoShareReady = {};
      for (const id of this.activePlayerIds()) {
        view.infoShareReady[id] = p.infoShareSelections?.has(id) ?? false;
      }
    }
    if (p.type === "training_take" && forPlayerId === p.effectUserId) {
      view.validCardIds = p.peekedCards?.map((c) => c.id);
    }

    return view;
  }

  private autoResolve(): void {
    if (!this.pending) return;
    switch (this.pending.type) {
      case "draw": {
        const drawer = this.pending.playerIds[0]!;
        const sourceId = this.pending.sourcePlayerId!;
        const source = this.players.get(sourceId)!;
        const card = pickRandom(source.hand, this.random);
        this.transferCard(sourceId, drawer, card.id);
        this.afterDraw(drawer);
        break;
      }
      case "play_or_skip":
        this.resolveSkipPlay(this.pending.playerIds[0]!);
        break;
      case "select_target": {
        const user = this.pending.effectUserId!;
        const targets = this.getValidTargets(user, this.pending.effectCard!);
        if (targets.length > 0) this.resolveSelectTarget(user, pickRandom(targets, this.random));
        break;
      }
      case "select_card": {
        const user = this.pending.effectUserId!;
        const target = this.players.get(this.pending.targetId!)!;
        const card = pickRandom(target.hand, this.random);
        this.resolveSelectCard(user, card.id);
        break;
      }
      case "info_share": {
        for (const id of this.activePlayerIds()) {
          if (!this.pending.infoShareSelections?.has(id)) {
            const p = this.players.get(id)!;
            const card = pickRandom(p.hand, this.random);
            this.pending.infoShareSelections?.set(id, card.id);
          }
        }
        this.finishInfoShare();
        break;
      }
      case "trade": {
        for (const id of this.pending.playerIds) {
          if (!this.pending.tradeSelections?.has(id)) {
            const p = this.players.get(id)!;
            const card = pickRandom(p.hand, this.random);
            this.pending.tradeSelections?.set(id, card.id);
          }
        }
        this.finishTrade();
        break;
      }
      case "training_take":
        this.resolveTrainingTake(this.pending.effectUserId!, false);
        break;
    }
  }

  private beginDrawPhase(): void {
    const currentId = this.seats[this.currentSeatIndex]!;
    const sourceId = this.drawSourceSeat(this.currentSeatIndex);
    this.phase = "draw";
    this.effectStep = "none";
    this.revealedCard = null;
    this.peekedCards = [];
    this.pending = {
      type: "draw",
      playerIds: [currentId],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: null,
      effectUserId: null,
      sourcePlayerId: sourceId,
    };
  }

  private resolveDraw(playerId: PlayerId, cardId: string): string | null {
    if (!this.pending || this.pending.type !== "draw") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    const sourceId = this.pending.sourcePlayerId!;
    if (!this.players.get(sourceId)?.hand.some((c) => c.id === cardId)) {
      return "そのカードは選べません";
    }
    this.transferCard(sourceId, playerId, cardId);
    this.afterDraw(playerId);
    return null;
  }

  private afterDraw(playerId: PlayerId): void {
    if (this.nomikaiBlockedPlayerId === playerId) {
      this.nomikaiBlockedPlayerId = null;
      this.endTurn();
      return;
    }
    const player = this.players.get(playerId)!;
    const pairable = getPairableTypes(player.hand);
    if (this.pairsRemainingThisTurn > 0 && pairable.length > 0) {
      this.phase = "play";
      this.pending = {
        type: "play_or_skip",
        playerIds: [playerId],
        deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
        effectCard: null,
        effectUserId: null,
      };
    } else {
      this.endTurn();
    }
  }

  private resolveSkipPlay(playerId: PlayerId): string | null {
    if (!this.pending || this.pending.type !== "play_or_skip") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    this.endTurn();
    return null;
  }

  private resolvePlayPair(playerId: PlayerId, cardType: CardType): string | null {
    if (!this.pending || this.pending.type !== "play_or_skip") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    const player = this.players.get(playerId)!;
    if (!getPairableTypes(player.hand).includes(cardType)) {
      return "そのペアは出せません";
    }
    player.hand = removeCardsByType(player.hand, cardType, 2);
    this.discardTypes.push(cardType, cardType);
    this.pairsRemainingThisTurn = Math.max(0, this.pairsRemainingThisTurn - 1);
    this.effectCard = cardType;
    this.effectUserId = playerId;
    this.phase = "effect";
    this.runEffect(cardType, playerId);
    return null;
  }

  private runEffect(cardType: CardType, userId: PlayerId): void {
    this.meetingDeclarations = {};
    this.revealedCard = null;
    this.peekedCards = [];

    switch (cardType) {
      case "norma":
        this.afterEffectResolved();
        break;
      case "nomikai": {
        const nextSeat = this.nextActiveSeat(this.currentSeatIndex);
        this.nomikaiBlockedPlayerId = this.seats[nextSeat]!;
        this.afterEffectResolved();
        break;
      }
      case "enadori":
        this.pairsRemainingThisTurn++;
        this.afterEffectResolved();
        break;
      case "tabako_kyuukei":
        this.effectStep = "tabaco_dump";
        for (const id of this.activePlayerIds()) {
          const p = this.players.get(id)!;
          const tabaco = p.hand.filter((c) => c.type === "tabako_kyuukei");
          for (const c of tabaco) {
            p.hand = removeCardById(p.hand, c.id).hand;
            this.discardTypes.push(c.type);
          }
        }
        this.afterEffectResolved();
        break;
      case "kaigi":
        this.effectStep = "meeting_declare";
        for (const id of this.activePlayerIds()) {
          const p = this.players.get(id)!;
          const hasZangyo = p.hand.some((c) => c.type === "zangyo");
          if (hasZangyo) this.meetingDeclarations[id] = true;
        }
        this.afterEffectResolved();
        break;
      case "jouhou_kyouyu":
        this.effectStep = "info_share";
        this.pending = {
          type: "info_share",
          playerIds: [...this.activePlayerIds()],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          infoShareSelections: new Map(),
        };
        break;
      case "shanai_renai":
      case "shinjin_kyouiku":
      case "torihiki":
      case "rouki":
      case "pawahara":
        this.effectStep = "select_target";
        this.beginTargetSelection(userId, cardType);
        break;
    }
  }

  private beginTargetSelection(userId: PlayerId, cardType: CardType): void {
    const targets = this.getValidTargets(userId, cardType);
    if (targets.length === 0) {
      this.afterEffectResolved();
      return;
    }
    if (targets.length === 1) {
      this.resolveSelectTarget(userId, targets[0]!);
      return;
    }
    this.pending = {
      type: "select_target",
      playerIds: [userId],
      deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
      effectCard: cardType,
      effectUserId: userId,
    };
  }

  private getValidTargets(userId: PlayerId, _cardType: CardType): PlayerId[] {
    return this.activePlayerIds().filter((id) => id !== userId);
  }

  private resolveSelectTarget(userId: PlayerId, targetId: PlayerId): string | null {
    if (!this.pending || this.pending.effectUserId !== userId) return "不正な操作です";
    const cardType = this.pending.effectCard ?? this.effectCard;
    if (!cardType) return "効果がありません";
    if (!this.getValidTargets(userId, cardType).includes(targetId)) {
      return "その対象は選べません";
    }

    this.pending.targetId = targetId;

    switch (cardType) {
      case "shanai_renai":
        this.effectStep = "reveal";
        this.peekedCards = [
          ...this.players.get(userId)!.hand,
          ...this.players.get(targetId)!.hand,
        ];
        this.afterEffectResolved();
        return null;
      case "shinjin_kyouiku": {
        const target = this.players.get(targetId)!;
        const peekCount = Math.min(2, target.hand.length);
        const pool = [...target.hand];
        this.peekedCards = [];
        for (let i = 0; i < peekCount; i++) {
          const card = pickRandom(pool, this.random);
          pool.splice(pool.indexOf(card), 1);
          this.peekedCards.push(card);
        }
        this.effectStep = "training";
        if (peekCount === 0) {
          this.afterEffectResolved();
          return null;
        }
        this.pending = {
          type: "training_take",
          playerIds: [userId],
          deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
          effectCard: cardType,
          effectUserId: userId,
          targetId,
          peekedCards: [...this.peekedCards],
        };
        return null;
      }
      case "torihiki":
        this.effectStep = "trade";
        this.pending = {
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
        this.effectStep = "select_card";
        this.pending = {
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

  private resolveSelectCard(userId: PlayerId, cardId: string): string | null {
    if (!this.pending || this.pending.type !== "select_card") return "不正な操作です";
    if (userId !== this.pending.effectUserId) return "あなたの番ではありません";
    const targetId = this.pending.targetId!;
    const target = this.players.get(targetId)!;
    if (!target.hand.some((c) => c.id === cardId)) return "そのカードは選べません";

    const cardType = this.pending.effectCard!;
    if (cardType === "rouki") {
      const { card, hand } = removeCardById(target.hand, cardId);
      target.hand = hand;
      this.revealedCard = { type: card.type, ownerId: targetId };

      if (card.type === "zangyo") {
        this.endGameRouki(userId, targetId);
        return null;
      }
      if (card.type === "pawahara") {
        const user = this.players.get(userId)!;
        user.hand.push(card);
        this.afterEffectResolved();
        return null;
      }
      target.hand.push(card);
      this.afterEffectResolved();
      return null;
    }

    if (cardType === "pawahara") {
      const { card, hand } = removeCardById(this.players.get(userId)!.hand, cardId);
      this.players.get(userId)!.hand = hand;
      this.players.get(targetId)!.hand.push(card);
      this.afterEffectResolved();
      return null;
    }

    return "未対応です";
  }

  private resolveInfoShare(playerId: PlayerId, cardId: string): string | null {
    if (!this.pending || this.pending.type !== "info_share") return "不正な操作です";
    const p = this.players.get(playerId)!;
    if (!p.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
    this.pending.infoShareSelections!.set(playerId, cardId);
    const active = this.activePlayerIds();
    if ([...this.pending.infoShareSelections!.keys()].length >= active.length) {
      this.finishInfoShare();
    }
    return null;
  }

  private finishInfoShare(): void {
    const selections = this.pending!.infoShareSelections!;
    const cardsToMove: { from: PlayerId; cardId: string }[] = [];
    for (const id of this.activePlayerIds()) {
      const cardId = selections.get(id);
      if (!cardId) continue;
      cardsToMove.push({ from: id, cardId });
    }
    for (const { from, cardId } of cardsToMove) {
      const leftSeat = this.leftOfSeat(this.seatIndexOf(from));
      const to = this.seats[leftSeat]!;
      if (this.players.get(to)?.status === "active") {
        this.transferCard(from, to, cardId);
      }
    }
    this.afterEffectResolved();
  }

  private resolveTrade(playerId: PlayerId, cardId: string): string | null {
    if (!this.pending || this.pending.type !== "trade") return "不正な操作です";
    if (!this.pending.playerIds.includes(playerId)) return "参加していません";
    const p = this.players.get(playerId)!;
    if (!p.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
    this.pending.tradeSelections!.set(playerId, cardId);
    if (this.pending.tradeSelections!.size >= 2) {
      this.finishTrade();
    }
    return null;
  }

  private finishTrade(): void {
    const [a, b] = this.pending!.playerIds;
    const cardA = this.pending!.tradeSelections!.get(a!)!;
    const cardB = this.pending!.tradeSelections!.get(b!)!;
    const playerA = this.players.get(a!)!;
    const playerB = this.players.get(b!)!;
    const removedA = removeCardById(playerA.hand, cardA);
    const removedB = removeCardById(playerB.hand, cardB);
    playerA.hand = removedA.hand;
    playerB.hand = removedB.hand;
    playerA.hand.push(removedB.card);
    playerB.hand.push(removedA.card);
    this.afterEffectResolved();
  }

  private resolveTrainingTake(userId: PlayerId, take: boolean, cardId?: string): string | null {
    if (!this.pending || this.pending.type !== "training_take") return "不正な操作です";
    if (userId !== this.pending.effectUserId) return "あなたの番ではありません";
    const targetId = this.pending.targetId!;
    if (take && cardId) {
      const peeked = this.pending.peekedCards?.find((c) => c.id === cardId);
      if (!peeked) return "そのカードは選べません";
      const target = this.players.get(targetId)!;
      const { hand } = removeCardById(target.hand, cardId);
      target.hand = hand;
      this.players.get(userId)!.hand.push(peeked);
    }
    this.afterEffectResolved();
    return null;
  }

  private afterEffectResolved(): void {
    this.effectStep = "none";
    this.pending = null;
    this.revealedCard = null;
    this.peekedCards = [];

    if (this.checkRetirement()) return;

    const userId = this.effectUserId!;
    const player = this.players.get(userId)!;
    const pairable = getPairableTypes(player.hand);
    if (
      this.pairsRemainingThisTurn > 0 &&
      pairable.length > 0 &&
      this.nomikaiBlockedPlayerId !== userId
    ) {
      this.phase = "play";
      this.pending = {
        type: "play_or_skip",
        playerIds: [userId],
        deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
        effectCard: null,
        effectUserId: null,
      };
      return;
    }
    this.endTurn();
  }

  private checkRetirement(): boolean {
    for (const id of this.activePlayerIds()) {
      const p = this.players.get(id)!;
      if (p.hand.length === 0) {
        p.status = "retired";
      }
    }
    const active = this.activePlayerIds();
    if (active.length <= 1) {
      this.endGameNormal();
      return true;
    }
    return false;
  }

  private endGameNormal(): void {
    const active = this.activePlayerIds();
    const retired = this.seats.filter((id) => this.players.get(id)?.status === "retired");
    const loser = active[0] ?? null;
    this.phase = "game_end";
    this.pending = null;
    this.result = {
      reason: "normal",
      winnerIds: retired,
      loserIds: loser ? [loser] : [],
    };
  }

  private endGameRouki(roukiUserId: PlayerId, zangyoUserId: PlayerId): void {
    const retired = this.seats.filter((id) => this.players.get(id)?.status === "retired");
    this.phase = "game_end";
    this.pending = null;
    this.result = {
      reason: "rouki",
      winnerIds: [roukiUserId, ...retired],
      loserIds: [zangyoUserId],
      roukiPlayerId: roukiUserId,
      zangyoPlayerId: zangyoUserId,
    };
  }

  private endTurn(): void {
    this.pairsRemainingThisTurn = 1;
    this.effectCard = null;
    this.effectUserId = null;
    this.pending = null;
    this.currentSeatIndex = this.nextActiveSeat(this.currentSeatIndex);
    if (this.checkRetirement()) return;
    this.beginDrawPhase();
  }

  private activePlayerIds(): PlayerId[] {
    return this.seats.filter((id) => this.players.get(id)?.status === "active");
  }

  private seatIndexOf(playerId: PlayerId): number {
    return this.seats.indexOf(playerId);
  }

  private nextActiveSeat(seatIndex: number): number {
    const n = this.seats.length;
    let j = (seatIndex + 1) % n;
    while (this.players.get(this.seats[j]!)?.status !== "active") {
      j = (j + 1) % n;
      if (j === seatIndex) break;
    }
    return j;
  }

  private rightOfSeat(seatIndex: number): number {
    return (seatIndex + 1) % this.seats.length;
  }

  private leftOfSeat(seatIndex: number): number {
    return (seatIndex - 1 + this.seats.length) % this.seats.length;
  }

  private drawSourceSeat(seatIndex: number): PlayerId {
    let j = this.rightOfSeat(seatIndex);
    while (this.players.get(this.seats[j]!)?.status !== "active") {
      j = this.rightOfSeat(j);
    }
    return this.seats[j]!;
  }

  private transferCard(fromId: PlayerId, toId: PlayerId, cardId: string): void {
    const from = this.players.get(fromId)!;
    const { card, hand } = removeCardById(from.hand, cardId);
    from.hand = hand;
    this.players.get(toId)!.hand.push(card);
  }
}

export function cardLabel(type: CardType): string {
  return CARD_LABELS[type];
}
