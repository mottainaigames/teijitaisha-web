import { useEffect, useRef, useState } from "react";
import {
  CARD_LABELS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CardType,
  type GameView,
  type RoomPublic,
} from "@teijitaisha/shared";
import { CardFan, PairCard, PlayingCard } from "./cards-ui";

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
  const activityLogRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = activityLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.activityLog.length, view.activityLog[view.activityLog.length - 1]?.id]);

  const isDrawPhase =
    view.canAct && view.pending?.type === "draw" && !!view.pending.sourcePlayerId;
  const handPickMode =
    view.canAct && view.pending
      ? view.pending.type === "info_share" || view.pending.type === "trade"
        ? view.pending.type
        : view.pending.type === "play_or_skip"
          ? "play_or_skip"
          : view.pending.type === "select_card" && view.effectCard === "pawahara"
            ? "pawahara_give"
            : null
      : null;

  const handleDrawPick = (cardId: string) => {
    twoStepPick(cardId, selectedCardId, setSelectedCardId, onDraw);
  };

  const handleMyCardClick = (card: GameView["myHand"][0]) => {
    if (handPickMode === "pawahara_give") {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onSelectCard);
      return;
    }
    if (handPickMode === "info_share") {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onInfoShare);
      return;
    }
    if (handPickMode === "trade") {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onTrade);
      return;
    }
    if (handPickMode === "play_or_skip" && pairable.includes(card.type)) {
      setSelectedPairType(card.type);
    }
  };

  const isMyCardSelected = (card: GameView["myHand"][0]) => {
    if (selectedCardId === card.id) return true;
    if (handPickMode === "play_or_skip" && selectedPairType === card.type) return true;
    return false;
  };

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

      {view.cpuStatus && (
        <div className={`cpu-banner cpu-banner--${view.cpuStatus.step}`}>
          {view.cpuStatus.message}
        </div>
      )}

      {view.lastPlay && (
        <div className="field-cards">
          <p className="field-cards__label">場に出た（{view.lastPlay.actorName}）</p>
          <PlayingCard cardType={view.lastPlay.cardType} />
          <PlayingCard cardType={view.lastPlay.cardType} />
        </div>
      )}

      <div className="opponents">
        {view.seats
          .filter((s) => s.playerId !== playerId)
          .map((s) => (
            <Opponent
              key={s.playerId}
              seat={s}
              isCurrent={s.playerId === view.currentPlayerId}
              isCpu={room.players.find((p) => p.id === s.playerId)?.isCpu ?? false}
              isDrawSource={isDrawPhase && view.pending?.sourcePlayerId === s.playerId}
              drawableCards={
                isDrawPhase && view.pending?.sourcePlayerId === s.playerId
                  ? (view.drawableHands[s.playerId] ?? [])
                  : []
              }
              selectedDrawId={selectedCardId}
              onSelectDraw={handleDrawPick}
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
          <CardFan>
            {view.peekedCards.map((c, i) => (
              <PlayingCard
                key={c.id}
                cardType={c.type}
                index={i}
                total={view.peekedCards.length}
              />
            ))}
          </CardFan>
        </div>
      )}

      <PendingActions
        view={view}
        pairable={pairable}
        selectedCardId={selectedCardId}
        selectedPairType={selectedPairType}
        selectedTargetId={selectedTargetId}
        onSelectCardId={setSelectedCardId}
        onSelectPairType={setSelectedPairType}
        onSelectTargetId={setSelectedTargetId}
        onPlayPair={onPlayPair}
        onSkipPlay={onSkipPlay}
        onSelectTarget={onSelectTarget}
        onSelectCard={onSelectCard}
        onTrainingTake={onTrainingTake}
      />

      <div className="my-hand">
        <p>
          あなたの手札（{me?.handCount ?? 0}枚）
          {me?.status === "retired" && " — 退社済み"}
          {handPickMode === "play_or_skip" && " — ペアをタップして選択"}
          {handPickMode === "info_share" && " — タップで選択 → もう一度で渡す"}
          {handPickMode === "trade" && " — タップで選択 → もう一度で交換"}
          {handPickMode === "pawahara_give" && " — タップで選択 → もう一度で渡す"}
        </p>
        {view.myHand.length > 0 ? (
          <CardFan>
            {view.myHand.map((c, i) => (
              <PlayingCard
                key={c.id}
                cardType={c.type}
                index={i}
                total={view.myHand.length}
                selectable={
                  handPickMode === "info_share" ||
                  handPickMode === "trade" ||
                  handPickMode === "pawahara_give" ||
                  (handPickMode === "play_or_skip" && pairable.includes(c.type))
                }
                selected={isMyCardSelected(c)}
                confirmReady={selectedCardId === c.id && handPickMode !== "play_or_skip"}
                onClick={
                  handPickMode
                    ? () => handleMyCardClick(c)
                    : undefined
                }
              />
            ))}
          </CardFan>
        ) : (
          <p className="status">手札なし</p>
        )}
      </div>

      {view.discardTypes.length > 0 && (
        <p className="status">場の履歴: {view.discardTypes.slice(-8).map((t) => CARD_LABELS[t]).join("、")}</p>
      )}

      {view.activityLog.length > 0 && (
        <div className="activity-log" ref={activityLogRef}>
          <p className="activity-log-title">ログ</p>
          <ul>
            {view.activityLog.map((entry) => (
              <li key={entry.id}>
                {entry.cardType && (
                  <span className="card-chip small">{CARD_LABELS[entry.cardType]}</span>
                )}
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Opponent({
  seat,
  isCurrent,
  isCpu,
  isDrawSource,
  drawableCards,
  selectedDrawId,
  onSelectDraw,
}: {
  seat: GameView["seats"][0];
  isCurrent: boolean;
  isCpu: boolean;
  isDrawSource?: boolean;
  drawableCards?: { id: string }[];
  selectedDrawId?: string | null;
  onSelectDraw?: (id: string) => void;
}) {
  const cards = drawableCards ?? [];
  return (
    <div className={`opponent ${isCurrent ? "current" : ""} ${seat.status}`}>
      <strong>
        {seat.name}
        {isCpu && <span className="cpu-tag">CPU</span>}
      </strong>
      <span>{seat.handCount}枚</span>
      {seat.status === "retired" && <span>退社</span>}
      {seat.status === "disconnected" && <span>切断</span>}
      {isDrawSource && cards.length > 0 && (
        <div className="opponent-draw">
          <p className="opponent-draw-label">✋ 引くカードを選ぶ</p>
          <CardFan className="card-fan--opponent">
            {cards.map((c, i) => (
              <PlayingCard
                key={c.id}
                faceDown
                size="sm"
                index={i}
                total={cards.length}
                selectable
                selected={selectedDrawId === c.id}
                confirmReady={selectedDrawId === c.id}
                onClick={() => onSelectDraw?.(c.id)}
              />
            ))}
          </CardFan>
        </div>
      )}
    </div>
  );
}

function PendingActions({
  view,
  pairable,
  selectedCardId,
  selectedPairType,
  selectedTargetId,
  onSelectCardId,
  onSelectPairType,
  onSelectTargetId,
  onPlayPair,
  onSkipPlay,
  onSelectTarget,
  onSelectCard,
  onTrainingTake,
}: {
  view: GameView;
  pairable: CardType[];
  selectedCardId: string | null;
  selectedPairType: CardType | null;
  selectedTargetId: string | null;
  onSelectCardId: (id: string | null) => void;
  onSelectPairType: (t: CardType | null) => void;
  onSelectTargetId: (id: string | null) => void;
  onPlayPair: (cardType: CardType) => void;
  onSkipPlay: () => void;
  onSelectTarget: (targetId: string) => void;
  onSelectCard: (cardId: string) => void;
  onTrainingTake: (take: boolean, cardId?: string) => void;
}) {
  if (!view.canAct || !view.pending) {
    return view.pending ? (
      <p className="status">他のプレイヤーの操作を待っています…</p>
    ) : null;
  }

  const p = view.pending;

  if (p.type === "draw" && p.sourcePlayerId) {
    const sourceName = nameOf(view.seats, p.sourcePlayerId);
    return (
      <div className="actions">
        <p>{sourceName}の手札から1枚引く</p>
        <p className="status">カードをタップで選択 → もう一度タップで引く</p>
      </div>
    );
  }

  if (p.type === "play_or_skip") {
    return (
      <div className="actions">
        <p>ペアを出しますか？</p>
        <p className="status">手札のカードをタップするか、下のペアから選んでください</p>
        <div className="pair-row">
          {pairable.map((t) => (
            <PairCard
              key={t}
              cardType={t}
              selectable
              selected={selectedPairType === t}
              onClick={() => onSelectPairType(t)}
            />
          ))}
        </div>
        <button
          type="button"
          className="action-confirm"
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
              onClick={() => onSelectTargetId(id)}
            >
              {nameOf(view.seats, id)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="action-confirm"
          disabled={!selectedTargetId}
          onClick={() => selectedTargetId && onSelectTarget(selectedTargetId)}
        >
          このプレイヤーを対象にする
        </button>
      </div>
    );
  }

  if (p.type === "select_card" && p.validCardIds) {
    if (view.effectCard === "pawahara") {
      return (
        <div className="actions">
          <p>パワハラ: 相手に渡すカードを選ぶ</p>
          <p className="status">下の手札をタップ → もう一度タップで渡す</p>
        </div>
      );
    }

    const cards = p.validCardIds.map((id) => ({ id, card: findCard(view, id) }));
    return (
      <div className="actions">
        <p>カードを選ぶ:</p>
        <p className="status">タップで選択 → もう一度タップで確定</p>
        <CardFan>
          {cards.map((item, i) => (
            <PlayingCard
              key={item.id}
              faceDown={!item.card}
              cardType={item.card?.type}
              index={i}
              total={cards.length}
              selectable
              selected={selectedCardId === item.id}
              confirmReady={selectedCardId === item.id}
              onClick={() =>
                twoStepPick(item.id, selectedCardId, onSelectCardId, onSelectCard)
              }
            />
          ))}
        </CardFan>
      </div>
    );
  }

  if (p.type === "info_share") {
    return (
      <div className="actions">
        <p>左隣に渡すカードを選ぶ</p>
        <p className="status">下の手札をタップ → もう一度タップで渡す</p>
      </div>
    );
  }

  if (p.type === "trade") {
    return (
      <div className="actions">
        <p>交換するカードを選ぶ</p>
        {p.tradeReady && (
          <p className="status">
            {Object.entries(p.tradeReady)
              .filter(([, ready]) => ready)
              .map(([id]) => `${nameOf(view.seats, id)} 選択済み`)
              .join(" / ") || "相手の選択を待っています…"}
          </p>
        )}
        <p className="status">下の手札をタップ → もう一度タップで交換</p>
      </div>
    );
  }

  if (p.type === "training_take" && view.peekedCards.length > 0) {
    return (
      <div className="actions">
        <p>1枚加えますか？</p>
        <p className="status">タップで選択 → もう一度タップで加える</p>
        <CardFan>
          {view.peekedCards.map((c, i) => (
            <PlayingCard
              key={c.id}
              cardType={c.type}
              index={i}
              total={view.peekedCards.length}
              selectable
              selected={selectedCardId === c.id}
              confirmReady={selectedCardId === c.id}
              onClick={() =>
                twoStepPick(c.id, selectedCardId, onSelectCardId, (id) =>
                  onTrainingTake(true, id),
                )
              }
            />
          ))}
        </CardFan>
        <button type="button" className="secondary" onClick={() => onTrainingTake(false)}>
          加えない
        </button>
      </div>
    );
  }

  return null;
}

function twoStepPick(
  cardId: string,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  onConfirm: (id: string) => void,
) {
  if (selectedId === cardId) {
    onConfirm(cardId);
    setSelectedId(null);
  } else {
    setSelectedId(cardId);
  }
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
