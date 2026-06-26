import { useEffect, useState } from "react";
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
  onAddCpu: () => void;
  onRemoveCpu: () => void;
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
  onAddCpu,
  onRemoveCpu,
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
              {p.isCpu && "（CPU）"}
            </li>
          ))}
        </ul>
        {isHost && !room.started && (
          <div className="cpu-controls">
            <button
              type="button"
              className="secondary"
              onClick={onAddCpu}
              disabled={room.players.length >= MAX_PLAYERS}
            >
              CPUを追加
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onRemoveCpu}
              disabled={!room.players.some((p) => p.isCpu)}
            >
              CPUを削除
            </button>
          </div>
        )}
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
        {view.phase === "play" && view.pairsRemainingThisTurn > 0 && (
          <span>残りペア: {view.pairsRemainingThisTurn}</span>
        )}
      </div>

      <div className="opponents">
        {view.seats
          .filter((s) => s.playerId !== playerId)
          .map((s) => (
            <Opponent
              key={s.playerId}
              seat={s}
              isCurrent={s.playerId === view.currentPlayerId}
              isCpu={room.players.find((p) => p.id === s.playerId)?.isCpu ?? false}
            />
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

function Opponent({
  seat,
  isCurrent,
  isCpu,
}: {
  seat: GameView["seats"][0];
  isCurrent: boolean;
  isCpu: boolean;
}) {
  return (
    <div className={`opponent ${isCurrent ? "current" : ""} ${seat.status}`}>
      <strong>
        {seat.name}
        {isCpu && <span className="cpu-tag">CPU</span>}
      </strong>
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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPairType, setSelectedPairType] = useState<CardType | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const pendingKey = view.pending
    ? `${view.pending.type}:${view.pending.playerIds.join(",")}:${view.pending.sourcePlayerId ?? ""}`
    : null;

  useEffect(() => {
    setSelectedCardId(null);
    setSelectedPairType(null);
    setSelectedTargetId(null);
  }, [pendingKey]);

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
        <p>右隣から1枚引く（タップして選択 → 確定）:</p>
        <div className="option-row">
          {cards.map((c, index) => (
            <button
              key={c.id}
              type="button"
              className={`option-btn card-back ${selectedCardId === c.id ? "selected" : ""}`}
              onClick={() => setSelectedCardId(c.id)}
            >
              カード{index + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={() => selectedCardId && onDraw(selectedCardId)}
        >
          このカードを引く
        </button>
      </div>
    );
  }

  if (p.type === "play_or_skip") {
    return (
      <div className="actions">
        <p>ペアを出しますか？（種類を選んでから確定）</p>
        <div className="option-row">
          {pairable.map((t) => (
            <button
              key={t}
              type="button"
              className={`option-btn ${selectedPairType === t ? "selected" : ""}`}
              onClick={() => setSelectedPairType(t)}
            >
              {CARD_LABELS[t]} ×2
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedPairType}
          onClick={() => selectedPairType && onPlayPair(selectedPairType)}
        >
          このペアを出す
        </button>
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
        <div className="option-row">
          {p.validTargets.map((id) => (
            <button
              key={id}
              type="button"
              className={`option-btn ${selectedTargetId === id ? "selected" : ""}`}
              onClick={() => setSelectedTargetId(id)}
            >
              {nameOf(view.seats, id)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedTargetId}
          onClick={() => selectedTargetId && onSelectTarget(selectedTargetId)}
        >
          このプレイヤーを対象にする
        </button>
      </div>
    );
  }

  if (p.type === "select_card" && p.validCardIds) {
    return (
      <div className="actions">
        <p>カードを選ぶ:</p>
        <div className="option-row">
          {p.validCardIds.map((id) => {
            const card = findCard(view, id);
            return (
              <button
                key={id}
                type="button"
                className={`option-btn ${selectedCardId === id ? "selected" : ""}`}
                onClick={() => setSelectedCardId(id)}
              >
                {card ? CARD_LABELS[card.type] : "？"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={() => selectedCardId && onSelectCard(selectedCardId)}
        >
          このカードを選ぶ
        </button>
      </div>
    );
  }

  if (p.type === "info_share") {
    return (
      <div className="actions">
        <p>左隣に渡すカードを選ぶ:</p>
        <div className="option-row">
          {view.myHand.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`option-btn ${selectedCardId === c.id ? "selected" : ""}`}
              onClick={() => setSelectedCardId(c.id)}
            >
              {CARD_LABELS[c.type]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={() => selectedCardId && onInfoShare(selectedCardId)}
        >
          このカードを渡す
        </button>
      </div>
    );
  }

  if (p.type === "trade") {
    return (
      <div className="actions">
        <p>交換するカードを選ぶ:</p>
        {p.tradeReady && (
          <p className="status">
            {Object.entries(p.tradeReady)
              .filter(([, ready]) => ready)
              .map(([id]) => `${nameOf(view.seats, id)} 選択済み`)
              .join(" / ") || "相手の選択を待っています…"}
          </p>
        )}
        <div className="option-row">
          {view.myHand.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`option-btn ${selectedCardId === c.id ? "selected" : ""}`}
              onClick={() => setSelectedCardId(c.id)}
            >
              {CARD_LABELS[c.type]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={() => selectedCardId && onTrade(selectedCardId)}
        >
          このカードで交換
        </button>
      </div>
    );
  }

  if (p.type === "training_take" && view.peekedCards.length > 0) {
    return (
      <div className="actions">
        <p>1枚加えますか？</p>
        <div className="option-row">
          {view.peekedCards.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`option-btn ${selectedCardId === c.id ? "selected" : ""}`}
              onClick={() => setSelectedCardId(c.id)}
            >
              {CARD_LABELS[c.type]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedCardId}
          onClick={() => selectedCardId && onTrainingTake(true, selectedCardId)}
        >
          選んだカードを加える
        </button>
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
