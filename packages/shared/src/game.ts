import type { CardType } from "./cards.js";
import type { PlayerId } from "./types.js";

export type GamePhase = "lobby" | "dealing" | "draw" | "play" | "effect" | "game_end";

export type EffectStep =
  | "none"
  | "select_target"
  | "select_card"
  | "reveal"
  | "info_share"
  | "trade"
  | "training"
  | "meeting_declare"
  | "tabaco_dump";

export type PendingInputType =
  | "draw"
  | "play_or_skip"
  | "select_target"
  | "select_card"
  | "info_share"
  | "trade"
  | "training_take"
  | "meeting_declare"
  | "romance_view";

export interface CardInstance {
  id: string;
  type: CardType;
}

export type GameEndReason = "normal" | "rouki";

export interface GameResult {
  reason: GameEndReason;
  winnerIds: PlayerId[];
  loserIds: PlayerId[];
  roukiPlayerId?: PlayerId;
  zangyoPlayerId?: PlayerId;
}

export interface SeatPublic {
  playerId: PlayerId;
  name: string;
  status: "active" | "retired" | "disconnected";
  handCount: number;
  seatIndex: number;
}

export type CpuProcessStep = "thinking" | "acting" | "effect";

export interface CpuProcessStatus {
  playerId: PlayerId;
  playerName: string;
  step: CpuProcessStep;
  message: string;
}

export interface GameActivityEntry {
  id: string;
  at: number;
  message: string;
  cardType?: CardType;
}

export interface LastPlayInfo {
  actorName: string;
  cardType: CardType;
  at: number;
}

/** 他プレイヤーがカード／対象を指している表示 */
export interface RemoteSelection {
  actorId: PlayerId;
  actorName: string;
  cardId: string | null;
  targetPlayerId: PlayerId | null;
  mode: "hover" | "selected";
}

/** 直前に移動したカード（抜き取りアニメ用） */
export interface CardTransfer {
  cardId: string;
  cardType?: CardType;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  at: number;
}

/** 労基で公開されたカード（全員向け演出用） */
export interface RoukiReveal {
  cardType: CardType;
  ownerId: PlayerId;
  ownerName: string;
  actorName: string;
  at: number;
}

/** クライアント向けゲーム状態（手札は自分のみ） */
export interface GameView {
  phase: GamePhase;
  seats: SeatPublic[];
  currentPlayerId: PlayerId | null;
  myPlayerId: PlayerId;
  myHand: CardInstance[];
  /** 相手の手札（引くとき用・種類は見えない） */
  drawableHands: Record<PlayerId, { id: string }[]>;
  discardTypes: CardType[];
  pairsRemainingThisTurn: number;
  nomikaiBlocked: boolean;
  effectCard: CardType | null;
  effectStep: EffectStep;
  pending: PendingView | null;
  result: GameResult | null;
  revealedCard: { type: CardType; ownerId: PlayerId } | null;
  meetingDeclarations: Record<PlayerId, boolean>;
  peekedCards: CardInstance[];
  canAct: boolean;
  /** 手札の並べ替え・シャッフルが可能 */
  canReorderHand: boolean;
  deadlineAt: number | null;
  /** 直近の出来事ログ（古い順） */
  activityLog: GameActivityEntry[];
  /** CPU が考えている／行動中の表示 */
  cpuStatus: CpuProcessStatus | null;
  /** 直前に場に出されたペア */
  lastPlay: LastPlayInfo | null;
  /** 他プレイヤーの選択・ホバー（自分が対象のとき用） */
  remoteSelection: RemoteSelection | null;
  /** 直前のカード移動 */
  lastTransfer: CardTransfer | null;
  /** 労基で公開されたカード（演出用） */
  lastRoukiReveal: RoukiReveal | null;
}

export interface PendingView {
  type: PendingInputType;
  playerIds: PlayerId[];
  /** select_target / select_card 用 */
  validTargets?: PlayerId[];
  /** select_card 用（労基など） */
  validCardIds?: string[];
  /** 取引: 相手が選んだか */
  tradeReady?: Record<PlayerId, boolean>;
  /** 情報共有: 誰が選んだか */
  infoShareReady?: Record<PlayerId, boolean>;
  /** 社内恋愛: 誰がスキップしたか */
  romanceSkipped?: Record<PlayerId, boolean>;
  sourcePlayerId?: PlayerId;
}

/** ゲーム中のクライアント → サーバー */
export type GameClientMessage =
  | { type: "start_game" }
  | { type: "draw_card"; cardId: string }
  | { type: "play_pair"; cardType: CardType }
  | { type: "skip_play" }
  | { type: "select_target"; targetId: PlayerId }
  | { type: "select_card"; cardId: string }
  | { type: "info_share_select"; cardId: string }
  | { type: "trade_select"; cardId: string }
  | { type: "training_take"; take: boolean; cardId?: string }
  | { type: "meeting_declare" }
  | { type: "romance_skip" }
  | { type: "shuffle_hand" }
  | { type: "reorder_hand"; cardIds: string[] };
