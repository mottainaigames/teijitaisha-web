import {
  CARD_LABELS,
  IDLE_TIMEOUT_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHANAI_RENAI_VIEW_MS,
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
  type PendingInputType,
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
  romanceSkips?: Set<PlayerId>;
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

  handleAction(
    playerId: PlayerId,
    action: { type: string; [key: string]: unknown },
  ): string | null {
    if (this.phase === "game_end") return "ゲームは終了しています";

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

  tick(now: number): void {
    if (!this.pending || now < this.pending.deadlineAt) return;
    this.remoteSelection = null;
    this.autoResolve();
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
    if (!this.pending || this.pending.type === "romance_view") return false;
    return this.pending.playerIds.includes(forPlayerId);
  }

  canReorderHand(playerId: PlayerId): boolean {
    if (this.phase === "game_end") return false;
    const player = this.players.get(playerId);
    if (!player || player.status !== "active") return false;
    const pending = this.pending;
    if (pending?.type === "draw" && pending.sourcePlayerId === playerId) return false;
    if (pending?.type === "select_card" && pending.targetId === playerId) return false;
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
        const cardType = this.pending.effectCard!;
        const hand =
          cardType === "pawahara"
            ? this.players.get(user)!.hand
            : this.players.get(this.pending.targetId!)!.hand;
        if (hand.length === 0) break;
        const card = pickRandom(hand, this.random);
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
      case "romance_view":
        this.finishRomanceView("timeout");
        break;
    }
  }

  private skipRomanceView(playerId: PlayerId): string | null {
    if (this.pending?.type !== "romance_view") return "スキップできません";
    if (!this.pending.playerIds.includes(playerId)) return "対象外です";
    if (!this.pending.romanceSkips) this.pending.romanceSkips = new Set();
    if (this.pending.romanceSkips.has(playerId)) return null;
    this.pending.romanceSkips.add(playerId);
    this.log(`${this.playerName(playerId)}が社内恋愛の確認をスキップ`, "shanai_renai");
    this.tryFinishRomanceView();
    return null;
  }

  private tryFinishRomanceView(): void {
    if (this.pending?.type !== "romance_view") return;
    const skips = this.pending.romanceSkips ?? new Set();
    if (this.pending.playerIds.every((id) => skips.has(id))) {
      this.finishRomanceView("skip");
    }
  }

  private finishRomanceView(reason: "skip" | "timeout"): void {
    if (this.pending?.type !== "romance_view") return;
    if (reason === "timeout") {
      this.log("社内恋愛の手札確認が終了", "shanai_renai");
    } else {
      this.log("社内恋愛の手札確認を双方がスキップ", "shanai_renai");
    }
    this.afterEffectResolved();
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
    this.log(`${this.playerName(playerId)}はペアを出さなかった`);
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
    this.meetingDeclarations = {};
    this.revealedCard = null;
    this.peekedCards = [];

    switch (cardType) {
      case "norma":
        this.log("効果なし");
        this.afterEffectResolved();
        break;
      case "nomikai": {
        const nextSeat = this.nextActiveSeat(this.currentSeatIndex);
        this.nomikaiBlockedPlayerId = this.seats[nextSeat]!;
        this.log(
          `${this.playerName(this.nomikaiBlockedPlayerId)}は次のターン、ペアを出せない（飲み会）`,
        );
        this.afterEffectResolved();
        break;
      }
      case "enadori":
        this.pairsRemainingThisTurn++;
        this.log(`${this.playerName(userId)}はもう1組ペアを出せる（エナドリ）`);
        this.afterEffectResolved();
        break;
      case "tabako_kyuukei":
        this.effectStep = "tabaco_dump";
        {
          let count = 0;
          for (const id of this.activePlayerIds()) {
            const p = this.players.get(id)!;
            const tabaco = p.hand.filter((c) => c.type === "tabako_kyuukei");
            for (const c of tabaco) {
              p.hand = removeCardById(p.hand, c.id).hand;
              this.discardTypes.push(c.type);
              count++;
            }
          }
          this.log(
            count > 0
              ? `全員のタバコ休憩${count}枚が場に出された`
              : "タバコ休憩は場に出されなかった",
            "tabako_kyuukei",
          );
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
        if (Object.keys(this.meetingDeclarations).length > 0) {
          const names = Object.keys(this.meetingDeclarations)
            .map((id) => this.playerName(id))
            .join("、");
          this.log(`会議: ${names}が残業カードを持っていると宣言`, "kaigi");
        } else {
          this.log("会議: 残業カードの宣言者なし", "kaigi");
        }
        this.afterEffectResolved();
        break;
      case "jouhou_kyouyu": {
        this.effectStep = "info_share";
        const actor = this.players.get(userId)!;
        if (actor.hand.length === 0) {
          actor.status = "retired";
          this.log(`${this.playerName(userId)}が情報共有のペアを出して定時退社`);
        }

        const participants = this.activePlayerIds();
        if (participants.length <= 1) {
          if (this.checkRetirement()) return;
          this.log("情報共有: 交換できる在籍者がいないためスキップ", "jouhou_kyouyu");
          this.afterEffectResolved();
          break;
        }

        this.log("情報共有: 在籍者が左隣に渡すカードを選ぶ", "jouhou_kyouyu");
        this.pending = {
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
        this.log(
          `${this.playerName(userId)}と${this.playerName(targetId)}の手札がお互いに見えた（社内恋愛）`,
          "shanai_renai",
        );
        this.pending = {
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
        this.log(
          `${this.playerName(userId)}が${this.playerName(targetId)}のカードを${peekCount}枚見た（新人教育）`,
          "shinjin_kyouiku",
        );
        const actor = this.players.get(userId)!;
        if (actor.hand.length === 0) {
          actor.status = "retired";
          this.log(`${this.playerName(userId)}が新人教育のペアを出して定時退社`);
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
        this.log(
          `${this.playerName(userId)}と${this.playerName(targetId)}がカード交換（取引）`,
          "torihiki",
        );
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
        this.log(
          `${this.playerName(userId)}が${this.playerName(targetId)}のカードを選ぶ（${CARD_LABELS[cardType]}）`,
          cardType,
        );
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

    const cardType = this.pending.effectCard!;

    if (cardType === "pawahara") {
      const user = this.players.get(userId)!;
      if (!user.hand.some((c) => c.id === cardId)) return "そのカードは選べません";
      const targetId = this.pending.targetId!;
      const { card, hand } = removeCardById(user.hand, cardId);
      user.hand = hand;
      this.players.get(targetId)!.hand.push(card);
      this.lastTransfer = {
        cardId: card.id,
        cardType: card.type,
        fromPlayerId: userId,
        toPlayerId: targetId,
        at: Date.now(),
      };
      this.log(
        `${this.playerName(userId)}が${CARD_LABELS[card.type]}を${this.playerName(targetId)}に渡した`,
        card.type,
      );
      this.afterEffectResolved();
      return null;
    }

    const targetId = this.pending.targetId!;
    const target = this.players.get(targetId)!;
    if (!target.hand.some((c) => c.id === cardId)) return "そのカードは選べません";

    if (cardType === "rouki") {
      const { card, hand } = removeCardById(target.hand, cardId);
      target.hand = hand;
      this.revealedCard = { type: card.type, ownerId: targetId };
      this.lastRoukiReveal = {
        cardType: card.type,
        ownerId: targetId,
        ownerName: this.playerName(targetId),
        actorName: this.playerName(userId),
        at: Date.now(),
      };

      if (card.type === "zangyo") {
        this.log(
          `${this.playerName(targetId)}の残業が摘発！${this.playerName(targetId)}の負け`,
          "zangyo",
        );
        this.endGameRouki(userId, targetId);
        return null;
      }
      if (card.type === "pawahara") {
        const user = this.players.get(userId)!;
        user.hand.push(card);
        this.log(
          `${CARD_LABELS[card.type]}が公開され、${this.playerName(userId)}の手札へ`,
          card.type,
        );
        this.afterEffectResolved();
        return null;
      }
      target.hand.push(card);
      this.log(
        `${CARD_LABELS[card.type]}を公開して戻した（${this.playerName(targetId)}）`,
        card.type,
      );
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
    const card = p.hand.find((c) => c.id === cardId)!;
    this.log(`${this.playerName(playerId)}が渡すカードを選択（${CARD_LABELS[card.type]}）`);
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
    this.log("情報共有: 選んだカードが左隣へ渡された", "jouhou_kyouyu");
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
    this.log(
      `${this.playerName(a!)}と${this.playerName(b!)}が${CARD_LABELS[removedA.card.type]}と${CARD_LABELS[removedB.card.type]}を交換`,
      "torihiki",
    );
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
      this.log(
        `${this.playerName(userId)}が${CARD_LABELS[peeked.type]}を手札に加えた（新人教育）`,
        peeked.type,
      );
    } else {
      this.log(`${this.playerName(userId)}はカードを加えなかった（新人教育）`);
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
    const retiredNow: string[] = [];
    for (const id of this.activePlayerIds()) {
      const p = this.players.get(id)!;
      if (p.hand.length === 0) {
        p.status = "retired";
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
    const retired = this.seats.filter((id) => this.players.get(id)?.status === "retired");
    const loser = active[0] ?? null;
    this.phase = "game_end";
    this.pending = null;
    this.result = {
      reason: "normal",
      winnerIds: retired,
      loserIds: loser ? [loser] : [],
    };
    this.log(loser ? `ゲーム終了: ${this.playerName(loser)}の負け` : "ゲーム終了");
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
    this.log("ゲーム終了: 労基摘発");
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
