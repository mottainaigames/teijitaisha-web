import {
  CARD_LABELS,
  IDLE_TIMEOUT_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CardType,
  dealHands,
  firstSeatDrawingFromMaxHand,
  getPairableTypes,
  hasUnequalHandSizes,
  pickRandom,
  removeCardById,
  removeCardsByType,
  type CardInstance,
  type EffectStep,
  type GamePhase,
  type GameResult,
  type GameView,
  type PendingView,
  type PlayerId,
  type CpuProcessStep,
  type CpuProcessStatus,
  type GameActivityEntry,
  type LastPlayInfo,
  type RemoteSelection,
  type CardTransfer,
} from "@teijitaisha/shared";
import { randomUUID } from "node:crypto";
import { EffectResolver } from "./game/effects/effect-resolver.js";
import type { EffectBridge, PendingInput, PlayerState } from "./game/effects/effect-types.js";

export type { PlayerState } from "./game/effects/effect-types.js";

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
  /** 退社した順番（早いほど順位が高い） */
  private retirementOrder: PlayerId[] = [];

  revealedCard: { type: CardType; ownerId: PlayerId } | null = null;
  meetingDeclarations: Record<PlayerId, boolean> = {};
  peekedCards: CardInstance[] = [];

  activityLog: GameActivityEntry[] = [];
  cpuStatus: CpuProcessStatus | null = null;
  lastPlay: LastPlayInfo | null = null;
  remoteSelection: RemoteSelection | null = null;
  lastTransfer: CardTransfer | null = null;
  lastRoukiReveal: {
    cardType: CardType;
    ownerId: PlayerId;
    ownerName: string;
    actorName: string;
    at: number;
  } | null = null;
  private plannedCpuAction: {
    playerId: PlayerId;
    action: { type: string; [key: string]: unknown };
  } | null = null;

  private readonly random: () => number;
  private readonly layout?: { seats: PlayerId[]; firstSeatIndex: number };
  private cpuPlayerIds = new Set<PlayerId>();
  private readonly effects = new EffectResolver();
  private effectBridgeCache: EffectBridge | null = null;

  constructor(
    entries: { id: PlayerId; name: string }[],
    random: () => number = Math.random,
    layout?: { seats: PlayerId[]; firstSeatIndex: number },
  ) {
    this.random = random;
    this.layout = layout;
    for (const e of entries) {
      this.players.set(e.id, {
        id: e.id,
        name: e.name,
        status: "active",
        hand: [],
        disconnectedAt: null,
      });
    }
  }

  start(): string | null {
    if (this.players.size < MIN_PLAYERS) {
      return `最低${MIN_PLAYERS}人必要です`;
    }
    if (this.players.size > MAX_PLAYERS) {
      return `最大${MAX_PLAYERS}人までです`;
    }
    this.seats = [...this.players.keys()];
    if (this.layout) {
      this.seats = [...this.layout.seats];
      this.firstPlayerSeatIndex = this.layout.firstSeatIndex;
    } else {
      // 座席シャッフル
      for (let i = this.seats.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.seats[i], this.seats[j]] = [this.seats[j]!, this.seats[i]!];
      }
    }

    const dealStartIndex = this.layout
      ? 0
      : Math.floor(this.random() * this.seats.length);
    const { hands } = dealHands(this.seats, dealStartIndex, this.random, () => randomUUID());
    for (const [id, hand] of Object.entries(hands)) {
      const p = this.players.get(id as PlayerId);
      if (p) p.hand = hand;
    }

    if (this.layout) {
      this.firstPlayerSeatIndex = this.layout.firstSeatIndex;
    } else if (hasUnequalHandSizes(this.seats, hands)) {
      this.firstPlayerSeatIndex = firstSeatDrawingFromMaxHand(this.seats, hands, this.random);
    } else {
      this.firstPlayerSeatIndex = Math.floor(this.random() * this.seats.length);
    }
    this.currentSeatIndex = this.firstPlayerSeatIndex;

    this.phase = "draw";
    this.pairsRemainingThisTurn = 1;
    this.nomikaiBlockedPlayerId = null;
    this.retirementOrder = [];
    this.result = null;
    this.log("ゲーム開始");
    this.log(`${this.playerName(this.seats[this.currentSeatIndex]!)}のターン`);
    this.beginDrawPhase();
    return null;
  }

  setCpuPlayerIds(ids: Set<PlayerId>): void {
    this.cpuPlayerIds = ids;
  }

  applyRomanceCpuSkips(): void {
    if (this.pending?.type !== "romance_view") return;
    if (!this.pending.romanceSkips) this.pending.romanceSkips = new Set();
    for (const id of this.pending.playerIds) {
      if (this.cpuPlayerIds.has(id)) {
        this.pending.romanceSkips.add(id);
      }
    }
    this.tryFinishRomanceView();
  }

  private bridge(): EffectBridge {
    if (this.effectBridgeCache) return this.effectBridgeCache;
    // GameEngine 状態への getter/setter ブリッジ用
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- クロージャで engine 参照が必要
    const engine = this;
    this.effectBridgeCache = {
      get effectStep() {
        return engine.effectStep;
      },
      set effectStep(value) {
        engine.effectStep = value;
      },
      get effectCard() {
        return engine.effectCard;
      },
      set effectCard(value) {
        engine.effectCard = value;
      },
      get effectUserId() {
        return engine.effectUserId;
      },
      set effectUserId(value) {
        engine.effectUserId = value;
      },
      get seats() {
        return engine.seats;
      },
      get currentSeatIndex() {
        return engine.currentSeatIndex;
      },
      get players() {
        return engine.players;
      },
      get discardTypes() {
        return engine.discardTypes;
      },
      get pairsRemainingThisTurn() {
        return engine.pairsRemainingThisTurn;
      },
      set pairsRemainingThisTurn(value) {
        engine.pairsRemainingThisTurn = value;
      },
      get nomikaiBlockedPlayerId() {
        return engine.nomikaiBlockedPlayerId;
      },
      set nomikaiBlockedPlayerId(value) {
        engine.nomikaiBlockedPlayerId = value;
      },
      get pending() {
        return engine.pending;
      },
      set pending(value) {
        engine.pending = value;
      },
      get meetingDeclarations() {
        return engine.meetingDeclarations;
      },
      set meetingDeclarations(value) {
        engine.meetingDeclarations = value;
      },
      get revealedCard() {
        return engine.revealedCard;
      },
      set revealedCard(value) {
        engine.revealedCard = value;
      },
      get peekedCards() {
        return engine.peekedCards;
      },
      set peekedCards(value) {
        engine.peekedCards = value;
      },
      get lastTransfer() {
        return engine.lastTransfer;
      },
      set lastTransfer(value) {
        engine.lastTransfer = value;
      },
      get lastRoukiReveal() {
        return engine.lastRoukiReveal;
      },
      set lastRoukiReveal(value) {
        engine.lastRoukiReveal = value;
      },
      playerName: (id) => engine.playerName(id),
      log: (msg, ct) => engine.log(msg, ct),
      activePlayerIds: () => engine.activePlayerIds(),
      nextActiveSeat: (seat) => engine.nextActiveSeat(seat),
      seatIndexOf: (id) => engine.seatIndexOf(id),
      leftOfSeat: (seat) => engine.leftOfSeat(seat),
      random: () => engine.random(),
      afterEffectResolved: () => engine.afterEffectResolved(),
      tryRetireActorAfterPair: (id, label) => engine.tryRetireActorAfterPair(id, label),
      markRetired: (id) => engine.markRetired(id),
      checkRetirement: () => engine.checkRetirement(),
      endGameRouki: (a, b) => engine.endGameRouki(a, b),
      transferCard: (from, to, cardId, insertRandom) =>
        engine.transferCard(from, to, cardId, insertRandom),
    };
    return this.effectBridgeCache;
  }

  handleAction(
    playerId: PlayerId,
    action: { type: string; [key: string]: unknown },
  ): string | null {
    if (this.phase === "game_end") return "ゲームは終了しています";
    if (!this.canReceiveAction(playerId)) return "操作できません";

    if (action.type === "shuffle_hand") {
      return this.shuffleHand(playerId);
    }
    if (action.type === "reorder_hand") {
      return this.reorderHand(playerId, action.cardIds as string[]);
    }

    if (!this.pending) return "入力待ちではありません";

    this.remoteSelection = null;
    let result: string | null;
    switch (this.pending.type) {
      case "draw":
        if (action.type !== "draw_card") return "カードを選んでください";
        result = this.resolveDraw(playerId, action.cardId as string);
        break;
      case "play_or_skip":
        if (action.type === "skip_play") result = this.resolveSkipPlay(playerId);
        else if (action.type === "play_pair")
          result = this.resolvePlayPair(playerId, action.cardType as CardType);
        else result = "ペアを出すかスキップしてください";
        break;
      case "select_target":
        if (action.type !== "select_target") return "対象を選んでください";
        result = this.resolveSelectTarget(playerId, action.targetId as PlayerId);
        break;
      case "select_card":
        if (action.type !== "select_card") return "カードを選んでください";
        result = this.resolveSelectCard(playerId, action.cardId as string);
        break;
      case "info_share":
        if (action.type !== "info_share_select") return "カードを選んでください";
        result = this.resolveInfoShare(playerId, action.cardId as string);
        break;
      case "trade":
        if (action.type !== "trade_select") return "カードを選んでください";
        result = this.resolveTrade(playerId, action.cardId as string);
        break;
      case "training_peek":
        if (action.type === "training_peek_select") {
          result = this.resolveTrainingPeekSelect(playerId, action.cardId as string);
        } else if (action.type === "training_peek_confirm") {
          result = this.resolveTrainingPeekConfirm(playerId);
        } else {
          result = "見るカードを選んでください";
        }
        break;
      case "training_take":
        if (action.type !== "training_take") return "選択してください";
        result = this.resolveTrainingTake(
          playerId,
          action.take as boolean,
          action.cardId as string | undefined,
        );
        break;
      case "romance_view":
        if (action.type !== "romance_skip") return "スキップするか待ってください";
        result = this.skipRomanceView(playerId);
        break;
      default:
        result = "未対応の入力です";
    }
    return result;
  }

  setSelectionPreview(
    actorId: PlayerId,
    preview: {
      cardId: string | null;
      targetPlayerId: PlayerId | null;
      mode: "hover" | "selected" | "clear";
    },
  ): string | null {
    if (this.phase === "game_end" || !this.pending) return null;

    const canPreview =
      this.pending.type === "info_share"
        ? this.activePlayerIds().includes(actorId)
        : this.pending.type === "trade"
          ? this.pending.playerIds.includes(actorId)
          : this.pending.playerIds.includes(actorId) || this.pending.effectUserId === actorId;

    if (!canPreview) return null;

    if (preview.mode === "clear") {
      if (this.remoteSelection?.actorId === actorId) {
        this.remoteSelection = null;
      }
      return null;
    }

    this.remoteSelection = {
      actorId,
      actorName: this.playerName(actorId),
      cardId: preview.cardId,
      targetPlayerId: preview.targetPlayerId,
      mode: preview.mode,
    };
    return null;
  }

  applyPlannedSelectionPreview(): void {
    if (!this.plannedCpuAction) return;
    const { playerId, action } = this.plannedCpuAction;
    let targetPlayerId: PlayerId | null = null;
    let cardId: string | null = null;

    switch (action.type) {
      case "draw_card":
        cardId = action.cardId as string;
        targetPlayerId = this.pending?.sourcePlayerId ?? null;
        break;
      case "select_card":
        cardId = action.cardId as string;
        targetPlayerId =
          this.pending?.effectCard === "pawahara" ? playerId : (this.pending?.targetId ?? null);
        break;
      case "training_peek_select":
        cardId = action.cardId as string;
        targetPlayerId = this.pending?.targetId ?? null;
        break;
      case "select_target":
        targetPlayerId = action.targetId as PlayerId;
        break;
      default:
        return;
    }

    this.remoteSelection = {
      actorId: playerId,
      actorName: this.playerName(playerId),
      cardId,
      targetPlayerId,
      mode: "selected",
    };
  }

  tick(now: number): boolean {
    if (!this.pending || now < this.pending.deadlineAt) return false;
    if (this.shouldDeferAutoResolve(now)) return false;
    this.remoteSelection = null;
    this.autoResolve();
    return true;
  }

  private canReceiveAction(playerId: PlayerId): boolean {
    const player = this.players.get(playerId);
    if (!player || player.status === "retired") return false;
    if (player.status === "active") return true;
    return player.status === "disconnected" && this.cpuPlayerIds.has(playerId);
  }

  private pendingActorIds(): PlayerId[] {
    if (!this.pending) return [];
    switch (this.pending.type) {
      case "select_target":
      case "select_card":
      case "training_peek":
      case "training_take":
        return this.pending.effectUserId ? [this.pending.effectUserId] : [];
      case "draw":
      case "play_or_skip":
        return [this.pending.playerIds[0]!];
      default:
        return [...this.pending.playerIds];
    }
  }

  private shouldDeferAutoResolve(now: number): boolean {
    for (const id of this.pendingActorIds()) {
      const player = this.players.get(id);
      if (!player) continue;
      if (
        player.status === "disconnected" &&
        player.disconnectedAt != null &&
        now < player.disconnectedAt + IDLE_TIMEOUT_MS
      ) {
        return true;
      }
      // ロビーCPUのみ runCpuTurns に委譲。切断後の自動プレイは tick で処理する
      if (this.cpuPlayerIds.has(id) && player.status === "active") return true;
    }
    return false;
  }

  /** CPU 用: 次の行動を決めて保持 */
  prepareCpuAction(playerId: PlayerId): { preview: string; needsEffect: boolean } | null {
    const action = this.pickRandomAction(playerId);
    if (!action) return null;
    this.plannedCpuAction = { playerId, action };
    return {
      preview: this.formatActionPreview(action),
      needsEffect: this.actionNeedsEffectDelay(action),
    };
  }

  executePreparedCpuAction(): string | null {
    if (!this.plannedCpuAction) return "行動が未準備です";
    const { playerId, action } = this.plannedCpuAction;
    this.plannedCpuAction = null;
    return this.handleAction(playerId, action);
  }

  setCpuStatus(
    playerId: PlayerId,
    playerName: string,
    step: CpuProcessStep,
    message: string,
  ): void {
    this.cpuStatus = { playerId, playerName, step, message };
  }

  clearCpuStatus(): void {
    this.cpuStatus = null;
  }

  private formatActionPreview(action: { type: string; [key: string]: unknown }): string {
    switch (action.type) {
      case "draw_card":
        return "カードを引く";
      case "skip_play":
        return "ペアを出さない";
      case "play_pair":
        return `${CARD_LABELS[action.cardType as CardType]}のペアを出す`;
      case "select_target":
        return `${this.playerName(action.targetId as PlayerId)}を対象にする`;
      case "select_card":
        return "カードを選ぶ";
      case "info_share_select":
        return "左隣に渡すカードを選ぶ";
      case "trade_select":
        return "交換するカードを選ぶ";
      case "training_peek_select":
        return "見るカードを選ぶ";
      case "training_peek_confirm":
        return "選んだカードを見る";
      case "training_take":
        if (action.take) {
          const card = this.peekedCards.find((c) => c.id === action.cardId);
          return card ? `${CARD_LABELS[card.type]}を加える` : "カードを加える";
        }
        return "カードを加えない";
      default:
        return "行動する";
    }
  }

  private actionNeedsEffectDelay(action: { type: string; [key: string]: unknown }): boolean {
    return (
      action.type === "play_pair" ||
      action.type === "select_target" ||
      action.type === "select_card"
    );
  }

  private playerName(playerId: PlayerId): string {
    return this.players.get(playerId)?.name ?? "?";
  }

  private log(message: string, cardType?: CardType): void {
    this.activityLog.push({
      id: randomUUID(),
      at: Date.now(),
      message,
      cardType,
    });
    if (this.activityLog.length > 30) {
      this.activityLog.shift();
    }
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
        if (pairable.length === 0) {
          return { type: "skip_play" };
        }
        const cardType = pickRandom(pairable, this.random);
        return { type: "play_pair", cardType };
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
      case "training_peek": {
        if (playerId !== p.effectUserId) return null;
        const target = this.players.get(p.targetId!);
        if (!target?.hand.length) return null;
        const max = Math.min(2, target.hand.length);
        const selected = p.trainingPeekSelections ?? new Set<string>();
        if (selected.size < max) {
          const remaining = target.hand.filter((c) => !selected.has(c.id));
          if (remaining.length === 0) {
            return { type: "training_peek_confirm" };
          }
          const card = pickRandom(remaining, this.random);
          return { type: "training_peek_select", cardId: card.id };
        }
        return { type: "training_peek_confirm" };
      }
      case "training_take": {
        if (playerId !== p.effectUserId) return null;
        const peeked = p.peekedCards ?? [];
        const options: { type: string; [key: string]: unknown }[] = [
          { type: "training_take", take: false },
        ];
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
    if (
      this.pending?.type === "training_peek" &&
      forPlayerId === this.pending.effectUserId &&
      this.pending.targetId
    ) {
      const target = this.players.get(this.pending.targetId);
      if (target) {
        drawableHands[target.id] = target.hand.map((c) => ({ id: c.id }));
      }
    }

    const otherHands: Record<PlayerId, CardInstance[]> = {};
    if (me?.status === "retired" && this.phase !== "lobby") {
      for (const id of this.seats) {
        if (id === forPlayerId) continue;
        const p = this.players.get(id)!;
        if (p.status === "active" || p.status === "disconnected") {
          otherHands[id] = [...p.hand];
        }
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
          autoPlay: p.status === "disconnected" && this.cpuPlayerIds.has(id),
        };
      }),
      currentPlayerId: currentId,
      myPlayerId: forPlayerId,
      myHand: me ? [...me.hand] : [],
      drawableHands,
      otherHands,
      discardTypes: [...this.discardTypes],
      pairsRemainingThisTurn: this.pairsRemainingThisTurn,
      nomikaiBlocked: this.nomikaiBlockedPlayerId === forPlayerId,
      effectCard: this.effectCard,
      effectStep: this.effectStep,
      pending: pendingView,
      result: this.result,
      revealedCard: this.revealedCard,
      meetingDeclarations: { ...this.meetingDeclarations },
      peekedCards: this.buildPeekedCards(forPlayerId),
      canAct: this.canPlayerAct(forPlayerId),
      canReorderHand: this.canReorderHand(forPlayerId),
      deadlineAt: this.pending?.deadlineAt ?? null,
      activityLog: [...this.activityLog],
      cpuStatus: this.cpuStatus ? { ...this.cpuStatus } : null,
      lastPlay: this.lastPlay ? { ...this.lastPlay } : null,
      remoteSelection: this.remoteSelection ? { ...this.remoteSelection } : null,
      lastTransfer: this.buildTransferView(forPlayerId),
      lastRoukiReveal: this.lastRoukiReveal ? { ...this.lastRoukiReveal } : null,
    };
  }

  /** オブザーバー向け: 全プレイヤーの手札を公開 */
  getObserverView(observerId: PlayerId): GameView {
    const currentId = this.seats[this.currentSeatIndex] ?? null;
    const pendingView = this.buildPendingView(observerId);

    const otherHands: Record<PlayerId, CardInstance[]> = {};
    for (const id of this.seats) {
      otherHands[id] = [...(this.players.get(id)?.hand ?? [])];
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
          autoPlay: p.status === "disconnected" && this.cpuPlayerIds.has(id),
        };
      }),
      currentPlayerId: currentId,
      myPlayerId: observerId,
      myHand: [],
      drawableHands: {},
      otherHands,
      discardTypes: [...this.discardTypes],
      pairsRemainingThisTurn: this.pairsRemainingThisTurn,
      nomikaiBlocked: false,
      effectCard: this.effectCard,
      effectStep: this.effectStep,
      pending: pendingView,
      result: this.result,
      revealedCard: this.revealedCard,
      meetingDeclarations: { ...this.meetingDeclarations },
      peekedCards: [],
      canAct: false,
      canReorderHand: false,
      deadlineAt: this.pending?.deadlineAt ?? null,
      activityLog: [...this.activityLog],
      cpuStatus: this.cpuStatus ? { ...this.cpuStatus } : null,
      lastPlay: this.lastPlay ? { ...this.lastPlay } : null,
      remoteSelection: this.remoteSelection ? { ...this.remoteSelection } : null,
      lastTransfer: this.buildTransferView(observerId),
      lastRoukiReveal: this.lastRoukiReveal ? { ...this.lastRoukiReveal } : null,
      isObserver: true,
    };
  }

  private buildPeekedCards(forPlayerId: PlayerId): CardInstance[] {
    if (this.pending?.type === "romance_view") {
      const userId = this.pending.effectUserId!;
      const targetId = this.pending.targetId!;
      if (forPlayerId !== userId && forPlayerId !== targetId) return [];
      const partnerId = forPlayerId === userId ? targetId : userId;
      return [...(this.players.get(partnerId)?.hand ?? [])];
    }
    if (forPlayerId === this.effectUserId) {
      return [...this.peekedCards];
    }
    return [];
  }

  private canPlayerAct(forPlayerId: PlayerId): boolean {
    const player = this.players.get(forPlayerId);
    if (!player || player.status !== "active") return false;
    if (!this.pending || this.pending.type === "romance_view") return false;
    if (!this.pending.playerIds.includes(forPlayerId)) return false;

    const currentId = this.seats[this.currentSeatIndex] ?? null;
    switch (this.pending.type) {
      case "draw":
      case "play_or_skip":
        return forPlayerId === currentId;
      case "select_target":
      case "select_card":
      case "training_peek":
      case "training_take":
        return forPlayerId === this.pending.effectUserId;
      default:
        return true;
    }
  }

  canReorderHand(playerId: PlayerId): boolean {
    if (this.phase === "game_end") return false;
    const player = this.players.get(playerId);
    if (!player || player.status !== "active") return false;
    const pending = this.pending;
    if (pending?.type === "draw" && pending.sourcePlayerId === playerId) return false;
    if (pending?.type === "select_card" && pending.targetId === playerId) return false;
    if (pending?.type === "training_peek" && pending.targetId === playerId) return false;
    return true;
  }

  shuffleHand(playerId: PlayerId): string | null {
    if (!this.canReorderHand(playerId)) return "今は並べ替えできません";
    const player = this.players.get(playerId);
    if (!player) return "不正な操作です";
    const hand = [...player.hand];
    for (let i = hand.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [hand[i], hand[j]] = [hand[j]!, hand[i]!];
    }
    player.hand = hand;
    return null;
  }

  reorderHand(playerId: PlayerId, cardIds: string[]): string | null {
    if (!this.canReorderHand(playerId)) return "今は並べ替えできません";
    const player = this.players.get(playerId);
    if (!player) return "不正な操作です";
    if (cardIds.length !== player.hand.length) return "不正な手札です";
    const handMap = new Map(player.hand.map((c) => [c.id, c]));
    if (cardIds.some((id) => !handMap.has(id))) return "不正なカードです";
    player.hand = cardIds.map((id) => handMap.get(id)!);
    return null;
  }

  private buildTransferView(forPlayerId: PlayerId): CardTransfer | null {
    if (!this.lastTransfer) return null;
    const t = this.lastTransfer;
    const canSeeType = forPlayerId === t.fromPlayerId || forPlayerId === t.toPlayerId;
    return {
      cardId: t.cardId,
      cardType: canSeeType ? t.cardType : undefined,
      fromPlayerId: t.fromPlayerId,
      toPlayerId: t.toPlayerId,
      at: t.at,
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
    if (p.type === "training_peek" && forPlayerId === p.effectUserId && p.targetId) {
      const target = this.players.get(p.targetId);
      view.validCardIds = target?.hand.map((c) => c.id);
      view.sourcePlayerId = p.targetId;
      view.trainingPeekMax = Math.min(2, target?.hand.length ?? 0);
      view.trainingPeekSelected = [...(p.trainingPeekSelections ?? [])];
    }
    if (p.type === "training_take" && forPlayerId === p.effectUserId) {
      view.validCardIds = p.peekedCards?.map((c) => c.id);
    }
    if (p.type === "romance_view") {
      const partnerId =
        forPlayerId === p.effectUserId ? p.targetId! : p.effectUserId!;
      view.sourcePlayerId = partnerId;
      view.romanceSkipped = {};
      for (const id of p.playerIds) {
        view.romanceSkipped[id] = p.romanceSkips?.has(id) ?? false;
      }
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
        this.resolveDraw(drawer, card.id);
        break;
      }
      case "play_or_skip": {
        const user = this.pending.playerIds[0]!;
        const action = this.pickRandomAction(user);
        if (action?.type === "play_pair") {
          this.resolvePlayPair(user, action.cardType as CardType);
        } else {
          this.resolveSkipPlay(user);
        }
        break;
      }
      case "select_target":
        this.effects.autoResolveSelectTarget(this.bridge());
        break;
      case "select_card":
        this.effects.autoResolveSelectCard(this.bridge());
        break;
      case "info_share":
        this.effects.autoResolveInfoShare(this.bridge());
        break;
      case "trade":
        this.effects.autoResolveTrade(this.bridge());
        break;
      case "training_peek":
        this.effects.autoResolveTrainingPeek(this.bridge());
        break;
      case "training_take":
        this.resolveTrainingTake(this.pending.effectUserId!, false);
        break;
      case "romance_view":
        this.finishRomanceView("timeout");
        break;
    }
  }

  private skipRomanceView(playerId: PlayerId): string | null {
    return this.effects.skipRomanceView(this.bridge(), playerId);
  }

  private tryFinishRomanceView(): void {
    this.effects.tryFinishRomanceView(this.bridge());
  }

  private finishRomanceView(reason: "skip" | "timeout"): void {
    this.effects.finishRomanceView(this.bridge(), reason);
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
    this.log(`${this.playerName(currentId)}は${this.playerName(sourceId)}からカードを引きます`);
  }

  private resolveDraw(playerId: PlayerId, cardId: string): string | null {
    if (!this.pending || this.pending.type !== "draw") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    const sourceId = this.pending.sourcePlayerId!;
    if (!this.players.get(sourceId)?.hand.some((c) => c.id === cardId)) {
      return "そのカードは選べません";
    }
    this.transferCard(sourceId, playerId, cardId, true);
    this.log(`${this.playerName(playerId)}が${this.playerName(sourceId)}からカードを1枚引きました`);
    this.afterDraw(playerId);
    return null;
  }

  private afterDraw(playerId: PlayerId): void {
    if (this.nomikaiBlockedPlayerId === playerId) {
      this.log(`${this.playerName(playerId)}は飲み会デバフでペアを出せず、ターン終了`);
      this.nomikaiBlockedPlayerId = null;
      this.endTurn();
      return;
    }
    this.maybeEnterPlayOrSkip(playerId);
  }

  /** 出せるペアがなければ残り枠を消費してターン終了、あれば play_or_skip へ */
  private maybeEnterPlayOrSkip(playerId: PlayerId): void {
    const player = this.players.get(playerId)!;
    if (player.status !== "active") {
      this.endTurn();
      return;
    }
    if (this.nomikaiBlockedPlayerId === playerId) {
      this.endTurn();
      return;
    }
    while (this.pairsRemainingThisTurn > 0) {
      if (getPairableTypes(player.hand).length === 0) {
        this.pairsRemainingThisTurn = 0;
        break;
      }
      this.phase = "play";
      this.pending = {
        type: "play_or_skip",
        playerIds: [playerId],
        deadlineAt: Date.now() + IDLE_TIMEOUT_MS,
        effectCard: null,
        effectUserId: null,
      };
      return;
    }
    this.endTurn();
  }

  private resolveSkipPlay(playerId: PlayerId): string | null {
    if (!this.pending || this.pending.type !== "play_or_skip") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    this.pairsRemainingThisTurn = Math.max(0, this.pairsRemainingThisTurn - 1);
    this.log(`${this.playerName(playerId)}はペアを出さなかった`);

    if (this.pairsRemainingThisTurn > 0) {
      this.maybeEnterPlayOrSkip(playerId);
      return null;
    }

    this.endTurn();
    return null;
  }

  private resolvePlayPair(playerId: PlayerId, cardType: CardType): string | null {
    if (!this.pending || this.pending.type !== "play_or_skip") return "不正な操作です";
    if (playerId !== this.pending.playerIds[0]) return "あなたの番ではありません";
    if (this.pairsRemainingThisTurn <= 0) return "このターンはこれ以上ペアを出せません";
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
    this.lastPlay = {
      actorName: this.playerName(playerId),
      cardType,
      at: Date.now(),
    };
    this.log(`${this.playerName(playerId)}が${CARD_LABELS[cardType]}のペアを場に出した`, cardType);
    this.runEffect(cardType, playerId);
    return null;
  }

  private runEffect(cardType: CardType, userId: PlayerId): void {
    this.effects.runEffect(this.bridge(), cardType, userId);
  }

  private getValidTargets(userId: PlayerId, cardType: CardType): PlayerId[] {
    return this.effects.getValidTargets(this.bridge(), userId, cardType);
  }

  private resolveSelectTarget(userId: PlayerId, targetId: PlayerId): string | null {
    return this.effects.resolveSelectTarget(this.bridge(), userId, targetId);
  }

  private resolveSelectCard(userId: PlayerId, cardId: string): string | null {
    return this.effects.resolveSelectCard(this.bridge(), userId, cardId);
  }

  private resolveInfoShare(playerId: PlayerId, cardId: string): string | null {
    return this.effects.resolveInfoShare(this.bridge(), playerId, cardId);
  }

  private resolveTrade(playerId: PlayerId, cardId: string): string | null {
    return this.effects.resolveTrade(this.bridge(), playerId, cardId);
  }

  private resolveTrainingPeekSelect(userId: PlayerId, cardId: string): string | null {
    return this.effects.resolveTrainingPeekSelect(this.bridge(), userId, cardId);
  }

  private resolveTrainingPeekConfirm(userId: PlayerId): string | null {
    return this.effects.resolveTrainingPeekConfirm(this.bridge(), userId);
  }

  private resolveTrainingTake(userId: PlayerId, take: boolean, cardId?: string): string | null {
    return this.effects.resolveTrainingTake(this.bridge(), userId, take, cardId);
  }

  private afterEffectResolved(): void {
    this.effectStep = "none";
    this.pending = null;
    this.revealedCard = null;
    this.peekedCards = [];

    if (this.checkRetirement()) return;

    const userId = this.effectUserId!;
    const player = this.players.get(userId)!;
    if (player.status !== "active") {
      this.endTurn();
      return;
    }
    if (this.pairsRemainingThisTurn > 0 && this.nomikaiBlockedPlayerId !== userId) {
      this.maybeEnterPlayOrSkip(userId);
      return;
    }
    this.endTurn();
  }

  private checkRetirement(): boolean {
    const retiredNow: string[] = [];
    for (const id of this.activePlayerIds()) {
      const p = this.players.get(id)!;
      if (p.hand.length === 0) {
        this.markRetired(id);
        retiredNow.push(this.playerName(id));
      }
    }
    if (retiredNow.length > 0) {
      this.log(`${retiredNow.join("、")}が手札0枚で退社`);
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
    const loser = active[0] ?? null;
    this.phase = "game_end";
    this.pending = null;
    this.result = {
      reason: "normal",
      winnerIds: [...this.retirementOrder],
      loserIds: loser ? [loser] : [],
      retirementOrder: [...this.retirementOrder],
    };
    this.log(loser ? `ゲーム終了: ${this.playerName(loser)}の負け` : "ゲーム終了");
  }

  private endGameRouki(roukiUserId: PlayerId, zangyoUserId: PlayerId): void {
    const drawIds = this.seats.filter((id) => id !== roukiUserId && id !== zangyoUserId);
    this.phase = "game_end";
    this.pending = null;
    this.result = {
      reason: "rouki",
      winnerIds: [roukiUserId],
      loserIds: [zangyoUserId],
      drawIds,
      retirementOrder: [...this.retirementOrder],
      roukiPlayerId: roukiUserId,
      zangyoPlayerId: zangyoUserId,
    };
    this.log("ゲーム終了: 労基摘発");
  }

  private markRetired(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (!p || p.status === "retired") return;
    p.status = "retired";
    if (!this.retirementOrder.includes(playerId)) {
      this.retirementOrder.push(playerId);
    }
  }

  /** ペア出し後に手札0枚なら退社して効果を打ち切る */
  private tryRetireActorAfterPair(userId: PlayerId, cardLabel: string): boolean {
    const actor = this.players.get(userId)!;
    if (actor.hand.length > 0) return false;
    this.markRetired(userId);
    this.log(`${this.playerName(userId)}が${cardLabel}のペアを出して定時退社`);
    this.afterEffectResolved();
    return true;
  }

  private endTurn(): void {
    this.pairsRemainingThisTurn = 1;
    this.effectCard = null;
    this.effectUserId = null;
    this.pending = null;
    this.currentSeatIndex = this.nextActiveSeat(this.currentSeatIndex);
    if (this.checkRetirement()) return;
    const nextId = this.seats[this.currentSeatIndex]!;
    this.log(`${this.playerName(nextId)}のターン`);
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

  private leftOfSeat(seatIndex: number): number {
    return (seatIndex - 1 + this.seats.length) % this.seats.length;
  }

  private drawSourceSeat(seatIndex: number): PlayerId {
    let j = this.leftOfSeat(seatIndex);
    while (this.players.get(this.seats[j]!)?.status !== "active") {
      j = this.leftOfSeat(j);
    }
    return this.seats[j]!;
  }

  private transferCard(
    fromId: PlayerId,
    toId: PlayerId,
    cardId: string,
    insertRandom = false,
  ): void {
    const from = this.players.get(fromId)!;
    const { card, hand } = removeCardById(from.hand, cardId);
    from.hand = hand;
    const toHand = this.players.get(toId)!.hand;
    if (insertRandom) {
      const index = Math.floor(this.random() * (toHand.length + 1));
      toHand.splice(index, 0, card);
    } else {
      toHand.push(card);
    }
    this.lastTransfer = {
      cardId: card.id,
      cardType: card.type,
      fromPlayerId: fromId,
      toPlayerId: toId,
      at: Date.now(),
    };
  }
}

export function cardLabel(type: CardType): string {
  return CARD_LABELS[type];
}
