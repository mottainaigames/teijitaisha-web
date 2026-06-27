import type {
  CardInstance,
  CardTransfer,
  CardType,
  EffectStep,
  PlayerId,
} from "@teijitaisha/shared";
import type { PendingInputType } from "@teijitaisha/shared";

export interface PlayerState {
  id: PlayerId;
  name: string;
  status: "active" | "retired" | "disconnected";
  hand: CardInstance[];
  disconnectedAt: number | null;
}

export interface PendingInput {
  type: PendingInputType;
  playerIds: PlayerId[];
  deadlineAt: number;
  effectCard: CardType | null;
  effectUserId: PlayerId | null;
  targetId?: PlayerId;
  peekedCards?: CardInstance[];
  infoShareSelections?: Map<PlayerId, string>;
  tradeSelections?: Map<PlayerId, string>;
  trainingPeekSelections?: Set<string>;
  sourcePlayerId?: PlayerId;
  romanceSkips?: Set<PlayerId>;
}

export interface RoukiRevealState {
  cardType: CardType;
  ownerId: PlayerId;
  ownerName: string;
  actorId: PlayerId;
  actorName: string;
  at: number;
}

/** GameEngine が EffectResolver に渡す読み書きインターフェース */
export interface EffectBridge {
  effectStep: EffectStep;
  effectCard: CardType | null;
  effectUserId: PlayerId | null;
  seats: PlayerId[];
  currentSeatIndex: number;
  players: Map<PlayerId, PlayerState>;
  discardTypes: CardType[];
  pairsRemainingThisTurn: number;
  nomikaiBlockedPlayerId: PlayerId | null;
  pending: PendingInput | null;
  meetingDeclarations: Record<PlayerId, boolean>;
  revealedCard: { type: CardType; ownerId: PlayerId } | null;
  peekedCards: CardInstance[];
  lastTransfer: CardTransfer | null;
  lastRoukiReveal: RoukiRevealState | null;

  playerName(playerId: PlayerId): string;
  log(message: string, cardType?: CardType): void;
  activePlayerIds(): PlayerId[];
  nextActiveSeat(seatIndex: number): number;
  seatIndexOf(playerId: PlayerId): number;
  leftOfSeat(seatIndex: number): number;
  random(): number;
  afterEffectResolved(): void;
  tryRetireActorAfterPair(userId: PlayerId, cardLabel: string): boolean;
  markRetired(playerId: PlayerId): void;
  checkRetirement(): boolean;
  endGameRouki(roukiUserId: PlayerId, zangyoUserId: PlayerId): void;
  transferCard(fromId: PlayerId, toId: PlayerId, cardId: string, insertRandom?: boolean): void;
}
