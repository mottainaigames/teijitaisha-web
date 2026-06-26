import {
  CARD_LABELS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CardType,
  type GameView,
  type RoomPublic,
} from "@teijitaisha/shared";

interface Props {
  room: RoomPublic;
  view: GameView;
  playerId: string;
  onStart: () => void;
  onDraw: (cardId: string) => void;
  onPlayPair: (cardType: CardType) => void;
  onSkipPlay: () => void;
  onSelectTarget: (targetId: string) => void;
  onSelectCard: (cardId: string) => void;
  onInfoShare: (cardId: string) => void;
  onTrade: (cardId: string) => void;
  onTrainingTake: (take: boolean, cardId?: string) => void;
}

const PHASE_LABELS: Record<GameView["phase"], string> = {
  lobby: "ロビー",
  dealing: "配布中",
  draw: "カードを引く",
  play: "ペアを出す",
  effect: "効果処理",
  game_end: "ゲーム終了",
};

export function GameScreen({
  room,
  view,
  playerId,
  onStart,
  onDraw,
  onPlayPair,
  onSkipPlay,
  onSelectTarget,
  onSelectCard,
  onInfoShare,
  onTrade,
  onTrainingTake,
}: Props) {
  const isHost = room.hostId === playerId;
  const me = view.seats.find((s) => s.playerId === playerId);
  const current = view.seats.find((s) => s.playerId === view.currentPlayerId);

  if (view.phase === "lobby" || !room.started) {
    return (
      <div className="card">
        <p className="status">{isHost ? "あなたがホストです" : "ルームに参加しました"}</p>
        <p className="room-code">{room.code}</p>
        <p className="status" style={{ textAlign: "center" }}>
          このコードを共有してください
        </p>
        <p className="status">参加者 {room.players.length} / {MAX_PLAYERS}</p>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.id === room.hostId && "（ホスト）"}
            </li>
          ))}
        </ul>
        {isHost && (
          <button
            type="button"
            onClick={onStart}
            disabled={room.players.length < MIN_PLAYERS}
          >
            ゲームを開始（{MIN_PLAYERS}人〜）
          </button>
        )}
        {!isHost && <p className="status">ホストの開始を待っています…</p>}
      </div>
    );
  }

  if (view.phase === "game_end" && view.result) {
    return (
      <div className="card">
        <h2>ゲーム終了</h2>
        <p className="status">
          {view.result.reason === "rouki" ? "労基摘発！" : "通常終了"}
        </p>
        <p>勝者: {view.result.winnerIds.map((id) => nameOf(view.seats, id)).join("、") || "なし"}</p>
        <p>敗者: {view.result.loserIds.map((id) => nameOf(view.seats, id)).join("、") || "なし"}</p>
      </div>
    );
  }

  const pairable = countPairs(view.myHand);

  return (
    <div className="game">
      <div className="game-status">
        <span className="room-code">{room.code}</span>
        <span>{PHASE_LABELS[view.phase]}</span>
        {current && <span>手番: {current.name}</span>}
        {view.nomikaiBlocked && <span className="badge">飲み会デバフ</span>}
        {view.pairsRemainingThisTurn > 1 && (
          <span>残りペア: {view.pairsRemainingThisTurn}</span>
        )}
      </div>

      <div className="opponents">
        {view.seats
          .filter((s) => s.playerId !== playerId)
          .map((s) => (
            <Opponent key={s.playerId} seat={s} isCurrent={s.playerId === view.currentPlayerId} />
          ))}
      </div>

      {view.revealedCard && (
        <p className="notice">
          公開: {CARD_LABELS[view.revealedCard.type]}（{nameOf(view.seats, view.revealedCard.ownerId)}）
        </p>
      )}

      {Object.keys(view.meetingDeclarations).length > 0 && (
        <p className="notice">
          会議宣言:{" "}
          {Object.entries(view.meetingDeclarations)
            .map(([id]) => `${nameOf(view.seats, id)}「持っています」`)
            .join("、")}
        </p>
      )}

      {view.peekedCards.length > 0 && (
        <div className="peek">
          <p>見えたカード:</p>
          <div className="hand">
            {view.peekedCards.map((c) => (
              <span key={c.id} className="card-chip">
                {CARD_LABELS[c.type]}
              </span>
            ))}
          </div>
        </div>
      )}

      <PendingActions
        view={view}
        pairable={pairable}
        onDraw={onDraw}
        onPlayPair={onPlayPair}
        onSkipPlay={onSkipPlay}
        onSelectTarget={onSelectTarget}
        onSelectCard={onSelectCard}
        onInfoShare={onInfoShare}
        onTrade={onTrade}
        onTrainingTake={onTrainingTake}
      />

      <div className="my-hand">
        <p>
          あなたの手札（{me?.handCount ?? 0}枚）
          {me?.status === "retired" && " — 退社済み"}
        </p>
        <div className="hand">
          {view.myHand.map((c) => (
            <span key={c.id} className="card-chip">
              {CARD_LABELS[c.type]}
            </span>
          ))}
        </div>
      </div>

      {view.discardTypes.length > 0 && (
        <p className="status">場: {view.discardTypes.slice(-6).map((t) => CARD_LABELS[t]).join("、")}</p>
      )}
    </div>
  );
}

function Opponent({ seat, isCurrent }: { seat: GameView["seats"][0]; isCurrent: boolean }) {
  return (
    <div className={`opponent ${isCurrent ? "current" : ""} ${seat.status}`}>
      <strong>{seat.name}</strong>
      <span>{seat.handCount}枚</span>
      {seat.status === "retired" && <span>退社</span>}
      {seat.status === "disconnected" && <span>切断</span>}
    </div>
  );
}

function PendingActions({
  view,
  pairable,
  onDraw,
  onPlayPair,
  onSkipPlay,
  onSelectTarget,
  onSelectCard,
  onInfoShare,
  onTrade,
  onTrainingTake,
}: {
  view: GameView;
  pairable: CardType[];
  onDraw: (cardId: string) => void;
  onPlayPair: (cardType: CardType) => void;
  onSkipPlay: () => void;
  onSelectTarget: (targetId: string) => void;
  onSelectCard: (cardId: string) => void;
  onInfoShare: (cardId: string) => void;
  onTrade: (cardId: string) => void;
  onTrainingTake: (take: boolean, cardId?: string) => void;
}) {
  if (!view.canAct || !view.pending) {
    return view.pending ? (
      <p className="status">他のプレイヤーの操作を待っています…</p>
    ) : null;
  }

  const p = view.pending;

  if (p.type === "draw" && p.sourcePlayerId) {
    const cards = view.drawableHands[p.sourcePlayerId] ?? [];
    return (
      <div className="actions">
        <p>右隣から1枚引く:</p>
        {cards.map((c) => (
          <button key={c.id} type="button" onClick={() => onDraw(c.id)}>
            ？
          </button>
        ))}
      </div>
    );
  }

  if (p.type === "play_or_skip") {
    return (
      <div className="actions">
        <p>ペアを出しますか？</p>
        {pairable.map((t) => (
          <button key={t} type="button" onClick={() => onPlayPair(t)}>
            {CARD_LABELS[t]} ×2
          </button>
        ))}
        <button type="button" className="secondary" onClick={onSkipPlay}>
          出さない
        </button>
      </div>
    );
  }

  if (p.type === "select_target" && p.validTargets) {
    return (
      <div className="actions">
        <p>対象を選ぶ:</p>
        {p.validTargets.map((id) => (
          <button key={id} type="button" onClick={() => onSelectTarget(id)}>
            {nameOf(view.seats, id)}
          </button>
        ))}
      </div>
    );
  }

  if (p.type === "select_card" && p.validCardIds) {
    return (
      <div className="actions">
        <p>カードを選ぶ:</p>
        {p.validCardIds.map((id) => {
          const card = findCard(view, id);
          return (
            <button key={id} type="button" onClick={() => onSelectCard(id)}>
              {card ? CARD_LABELS[card.type] : "？"}
            </button>
          );
        })}
      </div>
    );
  }

  if (p.type === "info_share") {
    return (
      <div className="actions">
        <p>左隣に渡すカードを選ぶ:</p>
        {view.myHand.map((c) => (
          <button key={c.id} type="button" onClick={() => onInfoShare(c.id)}>
            {CARD_LABELS[c.type]}
          </button>
        ))}
      </div>
    );
  }

  if (p.type === "trade") {
    return (
      <div className="actions">
        <p>交換するカードを選ぶ:</p>
        {view.myHand.map((c) => (
          <button key={c.id} type="button" onClick={() => onTrade(c.id)}>
            {CARD_LABELS[c.type]}
          </button>
        ))}
      </div>
    );
  }

  if (p.type === "training_take" && view.peekedCards.length > 0) {
    return (
      <div className="actions">
        <p>1枚加えますか？</p>
        {view.peekedCards.map((c) => (
          <button key={c.id} type="button" onClick={() => onTrainingTake(true, c.id)}>
            {CARD_LABELS[c.type]} を加える
          </button>
        ))}
        <button type="button" className="secondary" onClick={() => onTrainingTake(false)}>
          加えない
        </button>
      </div>
    );
  }

  return null;
}

function nameOf(seats: GameView["seats"], id: string): string {
  return seats.find((s) => s.playerId === id)?.name ?? "?";
}

function findCard(view: GameView, cardId: string) {
  if (view.myHand.some((c) => c.id === cardId)) {
    return view.myHand.find((c) => c.id === cardId);
  }
  if (view.peekedCards.some((c) => c.id === cardId)) {
    return view.peekedCards.find((c) => c.id === cardId);
  }
  return undefined;
}

function countPairs(hand: GameView["myHand"]): CardType[] {
  const counts = new Map<CardType, number>();
  for (const c of hand) {
    if (c.type === "zangyo") continue;
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
}
