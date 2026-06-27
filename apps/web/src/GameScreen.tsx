import { useEffect, useRef, useState } from "react";
import {
  CARD_EFFECTS,
  CARD_LABELS,
  CPU_SPEED_LABELS,
  isRecommendedPlayerCount,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECOMMENDED_MAX_PLAYERS,
  RECOMMENDED_MIN_PLAYERS,
  type CardType,
  type GameView,
  type RoomPublic,
} from "@teijitaisha/shared";
import { CardFan, PairCard, PlayingCard } from "./cards-ui";
import { CardEffectText } from "./card-effects-ui";
import { CollapsibleSection } from "./collapsible-section";
import { GameMenu, GameMenuButton } from "./game-menu";
import { HandPickHint, type HandPickPurpose } from "./hand-pick-hint";
import { LobbyMemberCard } from "./lobby-member-card";
import { LobbyAnnouncementStack, useLobbyAnnouncements } from "./lobby-announcement";
import { LobbySeatOrder } from "./lobby-seat-order";
import { ReorderableHandFan } from "./reorderable-hand-fan";
import { RoukiRevealOverlay } from "./rouki-reveal";
import { SeatOrderBar } from "./seat-order";
import { ProductAdBanner, ProductAdPopup } from "./product-ad";
import { GameResultShareButton, MottainaiLinks, RoomInviteShare } from "./social-promo";

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
  onTrainingPeekSelect: (cardId: string) => void;
  onTrainingPeekConfirm: () => void;
  onSelectionPreview: (payload: {
    cardId: string | null;
    targetPlayerId: string | null;
    mode: "hover" | "selected" | "clear";
  }) => void;
  onLeave: () => void;
  onReturnToLobby: () => void;
  onCycleCpuSpeed: () => void;
  onAdvanceCpu: () => void;
  onRomanceSkip: () => void;
  onShuffleHand: () => void;
  onReorderHand: (cardIds: string[]) => void;
  onReorderSeats: (playerIds: string[]) => void;
  onShuffleSeats: () => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onRenamePlayer: (targetPlayerId: string, name: string) => void;
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
  onTrainingPeekSelect,
  onTrainingPeekConfirm,
  onSelectionPreview,
  onLeave,
  onReturnToLobby,
  onCycleCpuSpeed,
  onAdvanceCpu,
  onRomanceSkip,
  onShuffleHand,
  onReorderHand,
  onReorderSeats,
  onShuffleSeats,
  onKickPlayer,
  onRenamePlayer,
}: Props) {
  const isHost = room.hostId === playerId;
  const me = view.seats.find((s) => s.playerId === playerId);
  const roomMe = room.players.find((p) => p.id === playerId);
  const isObserverMode = Boolean(view.isObserver ?? roomMe?.isObserver);
  const playingMembers = room.players.filter((p) => !p.isObserver);
  const observerMembers = room.players.filter((p) => p.isObserver);
  const current = view.seats.find((s) => s.playerId === view.currentPlayerId);
  const hasCpu = room.players.some((p) => p.isCpu);
  const drawSourceId = view.pending?.type === "draw" ? view.pending.sourcePlayerId : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProductAdPopup, setShowProductAdPopup] = useState(false);
  const prevPhaseRef = useRef<GameView["phase"]>(view.phase);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPairType, setSelectedPairType] = useState<CardType | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [focusedHandCardId, setFocusedHandCardId] = useState<string | null>(null);
  const [transferFx, setTransferFx] = useState<GameView["lastTransfer"]>(null);
  const lastTransferAtRef = useRef(0);

  const pendingKey = view.pending
    ? `${view.pending.type}:${view.pending.playerIds.join(",")}:${view.pending.sourcePlayerId ?? ""}`
    : null;

  useEffect(() => {
    setSelectedCardId(null);
    setSelectedPairType(null);
    setSelectedTargetId(null);
    setFocusedHandCardId(null);
  }, [pendingKey]);

  useEffect(() => {
    if (prevPhaseRef.current === "game_end" && view.phase === "lobby") {
      setShowProductAdPopup(true);
    }
    prevPhaseRef.current = view.phase;
  }, [view.phase]);

  useEffect(() => {
    if (focusedHandCardId && !view.myHand.some((c) => c.id === focusedHandCardId)) {
      setFocusedHandCardId(null);
    }
  }, [view.myHand, focusedHandCardId]);

  useEffect(() => {
    const t = view.lastTransfer;
    if (!t || t.at === lastTransferAtRef.current) return;
    lastTransferAtRef.current = t.at;
    setTransferFx(t);
    const timer = setTimeout(() => setTransferFx(null), 750);
    return () => clearTimeout(timer);
  }, [view.lastTransfer]);

  const isLobby = view.phase === "lobby" || !room.started;
  const lobbyAnnouncements = useLobbyAnnouncements({
    room,
    playerId,
    enabled: isLobby,
  });

  const seatOrder = (
    <SeatOrderBar
      seats={view.seats}
      currentPlayerId={view.currentPlayerId}
      drawSourcePlayerId={drawSourceId}
      myPlayerId={playerId}
    />
  );

  const menuExtra = (
    <>
      <section className="menu-section" aria-label="プレイ順">
        <h3 className="menu-section__title">プレイ順</h3>
        {seatOrder}
      </section>
      {view.activityLog.length > 0 && (
        <CollapsibleSection title="ログ" badge={view.activityLog.length}>
          <ActivityLogList entries={view.activityLog} />
        </CollapsibleSection>
      )}
      {view.discardTypes.length > 0 && (
        <CollapsibleSection title="場の履歴">
          <p className="status">
            {view.discardTypes
              .slice(-12)
              .map((t) => CARD_LABELS[t])
              .join("、")}
          </p>
        </CollapsibleSection>
      )}
    </>
  );

  const gameMenu = (
    <GameMenu
      open={menuOpen}
      onClose={() => setMenuOpen(false)}
      onLeave={onLeave}
      roomCode={room.code}
      showLeave={view.phase !== "game_end"}
      showCpuSpeed={hasCpu && isHost}
      cpuSpeedLabel={CPU_SPEED_LABELS[room.cpuSpeed]}
      onCycleCpuSpeed={onCycleCpuSpeed}
      showAdvanceCpu={room.cpuWaitingAdvance}
      onAdvanceCpu={onAdvanceCpu}
    >
      {menuExtra}
    </GameMenu>
  );

  if (isLobby) {
    const playerCount = playingMembers.length;
    const recommended = isRecommendedPlayerCount(playerCount);
    const canStart =
      !isObserverMode &&
      playerCount >= MIN_PLAYERS &&
      playerCount <= MAX_PLAYERS;
    const canManageMembers = isHost && !isObserverMode && !room.started;

    return (
      <div className="game-shell game-shell--lobby">
        <LobbyAnnouncementStack items={lobbyAnnouncements} />
        {gameMenu}
        {showProductAdPopup && (
          <div className="product-ad-popup-backdrop">
            <ProductAdPopup onClose={() => setShowProductAdPopup(false)} />
          </div>
        )}
        <div className="lobby-screen">
          <header className="lobby-screen__header">
            <div className="lobby-screen__header-main">
              <p className="lobby-screen__role">
                {isObserverMode
                  ? "オブザーバーとして参加中"
                  : isHost
                    ? "あなたがホスト"
                    : "プレイヤーとして参加"}
              </p>
              <p className="lobby-screen__count">
                プレイヤー {playerCount} / {MAX_PLAYERS}
                <span className="lobby-screen__recommended">
                  （推奨 {RECOMMENDED_MIN_PLAYERS}〜{RECOMMENDED_MAX_PLAYERS}人）
                </span>
              </p>
            </div>
            <GameMenuButton onClick={() => setMenuOpen(true)} />
          </header>

          <div className="lobby-screen__invite">
            <RoomInviteShare roomCode={room.code} />
          </div>

          {!recommended && playerCount >= MIN_PLAYERS && !isObserverMode && (
            <div className="lobby-warning" role="status">
              <p className="lobby-warning__title">推奨人数外でプレイします</p>
              <p className="lobby-warning__body">
                ルール上の推奨は {RECOMMENDED_MIN_PLAYERS}〜{RECOMMENDED_MAX_PLAYERS}人です。
                {playerCount < RECOMMENDED_MIN_PLAYERS
                  ? "人数が少ないとゲームが短く終わりやすく、バランスが崩れる可能性があります。"
                  : "人数が多いと手札が極端に少なくなり、待ち時間やバランスが崩れる可能性があります。"}
                問題なければこのまま開始できます。
              </p>
            </div>
          )}

          <section className="lobby-screen__members" aria-label="参加メンバー">
            <div className="lobby-screen__members-head">
              <h2 className="lobby-screen__members-title">プレイヤー</h2>
              <span className="lobby-screen__members-count">{playerCount}人</span>
            </div>
            <ul className="lobby-player-grid">
              {playingMembers.map((p) => (
                <LobbyMemberCard
                  key={p.id}
                  player={p}
                  variant="player"
                  isMe={p.id === playerId}
                  isRoomHost={p.id === room.hostId}
                  canManage={canManageMembers}
                  onRename={onRenamePlayer}
                  onKick={onKickPlayer}
                />
              ))}
            </ul>
            {observerMembers.length > 0 && (
              <>
                <div className="lobby-screen__members-head lobby-screen__members-head--observers">
                  <h2 className="lobby-screen__members-title">オブザーバー</h2>
                  <span className="lobby-screen__members-count">{observerMembers.length}人</span>
                </div>
                <ul className="lobby-player-grid lobby-player-grid--observers">
                  {observerMembers.map((p) => (
                    <LobbyMemberCard
                      key={p.id}
                      player={p}
                      variant="observer"
                      isMe={p.id === playerId}
                      isRoomHost={false}
                      canManage={canManageMembers}
                      onRename={onRenamePlayer}
                      onKick={onKickPlayer}
                    />
                  ))}
                </ul>
              </>
            )}
            <section className="lobby-section" aria-label="プレイ順">
              <div className="lobby-section__head">
                <h2 className="lobby-section__title">プレイ順（座席）</h2>
              </div>
              <LobbySeatOrder
                players={playingMembers}
                myPlayerId={playerId}
                editable={isHost && !isObserverMode}
                onReorder={onReorderSeats}
                onShuffle={onShuffleSeats}
              />
            </section>
          </section>

          <footer className="lobby-screen__footer">
            <div className="lobby-screen__actions">
              {isHost && !room.started && !isObserverMode && (
                <div className="cpu-controls">
                  <button
                    type="button"
                    className="secondary"
                    onClick={onAddCpu}
                    disabled={playingMembers.length >= MAX_PLAYERS}
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
              {isHost && !isObserverMode && (
                <button type="button" onClick={onStart} disabled={!canStart}>
                  ゲームを開始（{MIN_PLAYERS}〜{MAX_PLAYERS}人）
                </button>
              )}
              {!isHost && !isObserverMode && (
                <p className="status lobby-screen__waiting">ホストの開始を待っています…</p>
              )}
              {isObserverMode && (
                <p className="status lobby-screen__waiting">
                  観戦モード — 全員の手札が見える状態でプレイを見られます
                </p>
              )}
            </div>
            <ProductAdBanner className="product-ad-banner--lobby" />
            <MottainaiLinks className="mottainai-links--lobby" />
          </footer>
        </div>
      </div>
    );
  }

  if (view.phase === "game_end" && view.result) {
    const { result } = view;
    const isRouki = result.reason === "rouki";

    return (
      <div className="game-shell game-shell--scroll">
        {gameMenu}
        <div className="game-screen-scroll">
          <div className="card">
            <div className="screen-header">
              <h2>ゲーム終了</h2>
              <GameMenuButton onClick={() => setMenuOpen(true)} />
            </div>
            <div className="game-end">
              <p className="game-end__reason status">{isRouki ? "労基摘発で終了" : "通常終了"}</p>

              {result.retirementOrder.length > 0 && (
                <section className="game-end__section">
                  <h3 className="game-end__heading">退社順</h3>
                  <ol className="game-end__retire-list">
                    {result.retirementOrder.map((id, index) => (
                      <li
                        key={id}
                        className={[
                          "game-end__retire-item",
                          id === playerId ? "game-end__retire-item--me" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className="game-end__rank">{index + 1}</span>
                        <span className="game-end__name">{nameOf(view.seats, id)}</span>
                        {index === 0 && !isRouki && (
                          <span className="game-end__badge game-end__badge--fast">最速退社</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section className="game-end__section">
                <h3 className="game-end__heading">結果</h3>
                {isRouki ? (
                  <ul className="game-end__outcomes">
                    <li className="game-end__outcome game-end__outcome--winner">
                      <span className="game-end__outcome-label">勝者</span>
                      <span className="game-end__outcome-name">
                        {nameOf(view.seats, result.roukiPlayerId!)}
                      </span>
                      <span className="game-end__outcome-note">労基で残業を摘発</span>
                    </li>
                    <li className="game-end__outcome game-end__outcome--loser">
                      <span className="game-end__outcome-label">敗者</span>
                      <span className="game-end__outcome-name">
                        {nameOf(view.seats, result.zangyoPlayerId!)}
                      </span>
                      <span className="game-end__outcome-note">残業が暴露</span>
                    </li>
                    {(result.drawIds?.length ?? 0) > 0 && (
                      <li className="game-end__outcome game-end__outcome--draw">
                        <span className="game-end__outcome-label">引き分け</span>
                        <span className="game-end__outcome-name">
                          {result.drawIds!.map((id) => nameOf(view.seats, id)).join("、")}
                        </span>
                      </li>
                    )}
                  </ul>
                ) : (
                  <ul className="game-end__outcomes">
                    {result.winnerIds.length > 0 && (
                      <li className="game-end__outcome game-end__outcome--winner">
                        <span className="game-end__outcome-label">勝者</span>
                        <span className="game-end__outcome-name">
                          {result.winnerIds.map((id) => nameOf(view.seats, id)).join("、")}
                        </span>
                        <span className="game-end__outcome-note">退社順どおり</span>
                      </li>
                    )}
                    {result.loserIds.length > 0 && (
                      <li className="game-end__outcome game-end__outcome--loser">
                        <span className="game-end__outcome-label">敗者</span>
                        <span className="game-end__outcome-name">
                          {result.loserIds.map((id) => nameOf(view.seats, id)).join("、")}
                        </span>
                        <span className="game-end__outcome-note">最後まで手札を残した</span>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </div>
            <div className="game-end-actions">
              <GameResultShareButton
                playerId={playerId}
                playerName={nameOf(view.seats, playerId)}
                result={result}
                seats={view.seats}
                roomCode={room.code}
              />
              <button type="button" onClick={onReturnToLobby}>
                ルームに戻る
              </button>
              <button type="button" className="secondary" onClick={onLeave}>
                ルームを退出
              </button>
            </div>
          </div>
          <MottainaiLinks className="mottainai-links--footer" />
        </div>
      </div>
    );
  }

  const isSpectating =
    isObserverMode || (me?.status === "retired" && view.phase !== "game_end");
  const pairable = countPairs(view.myHand);
  const cardTargetPlayerId = getCardTargetPlayerId(view);
  const remoteOnMe = view.remoteSelection?.targetPlayerId === playerId;

  const sendCardPreview = (cardId: string | null, mode: "hover" | "selected" | "clear") => {
    if (!view.canAct) return;
    onSelectionPreview({
      cardId,
      targetPlayerId: cardTargetPlayerId,
      mode,
    });
  };

  const sendTargetPreview = (targetId: string | null, mode: "hover" | "selected" | "clear") => {
    if (!view.canAct) return;
    onSelectionPreview({ cardId: null, targetPlayerId: targetId, mode });
  };

  const cardRemoteState = (cardId: string) => {
    const rs = view.remoteSelection;
    if (!rs || rs.targetPlayerId !== playerId || rs.actorId === playerId) {
      return { remoteHover: false, remoteSelected: false };
    }
    return {
      remoteHover: rs.mode === "hover" && rs.cardId === cardId,
      remoteSelected: rs.mode === "selected" && rs.cardId === cardId,
    };
  };

  const isDrawPhase = view.canAct && view.pending?.type === "draw" && !!view.pending.sourcePlayerId;
  const drawSourceName = drawSourceId ? nameOf(view.seats, drawSourceId) : null;
  const myDrawableCards =
    isDrawPhase && drawSourceId ? (view.drawableHands[drawSourceId] ?? []) : [];
  const anyoneDrawing = view.phase === "draw" && !!drawSourceId;
  const handPickPurpose: HandPickPurpose | null =
    view.canAct && view.pending
      ? view.pending.type === "info_share" || view.pending.type === "trade"
        ? view.pending.type
        : view.pending.type === "play_or_skip"
          ? "play_or_skip"
          : view.pending.type === "select_card" && view.effectCard === "pawahara"
            ? "pawahara_give"
            : null
      : null;
  const hasHandPickSubmitted =
    handPickPurpose === "info_share"
      ? (view.pending?.infoShareReady?.[playerId] ?? false)
      : handPickPurpose === "trade"
        ? (view.pending?.tradeReady?.[playerId] ?? false)
        : false;
  const isPickingFromHand =
    (handPickPurpose !== null && !hasHandPickSubmitted) ||
    (handPickPurpose !== null && hasHandPickSubmitted);
  const isMyHandPicking = handPickPurpose !== null && !hasHandPickSubmitted;

  const handleDrawPick = (cardId: string) => {
    twoStepPick(cardId, selectedCardId, setSelectedCardId, onDraw, (id) =>
      sendCardPreview(id, "selected"),
    );
  };

  const handleMyCardClick = (card: GameView["myHand"][0]) => {
    if (handPickPurpose === "info_share" && !hasHandPickSubmitted) {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onInfoShare, (id) =>
        sendCardPreview(id, "selected"),
      );
      return;
    }
    if (handPickPurpose === "trade" && !hasHandPickSubmitted) {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onTrade, (id) =>
        sendCardPreview(id, "selected"),
      );
      return;
    }
    if (handPickPurpose === "pawahara_give") {
      twoStepPick(card.id, selectedCardId, setSelectedCardId, onSelectCard, (id) =>
        sendCardPreview(id, "selected"),
      );
      return;
    }
    if (handPickPurpose === "play_or_skip" && pairable.includes(card.type)) {
      if (selectedPairType === card.type) {
        onPlayPair(card.type);
        setSelectedPairType(null);
        setSelectedCardId(null);
        sendCardPreview(null, "clear");
      } else {
        setSelectedPairType(card.type);
        setSelectedCardId(card.id);
        sendCardPreview(card.id, "selected");
      }
      return;
    }
  };

  const isMyCardSelected = (card: GameView["myHand"][0]) => {
    if (selectedCardId === card.id) return true;
    if (handPickPurpose === "play_or_skip" && selectedPairType === card.type) return true;
    return false;
  };

  const inspectedHandCardType: CardType | null = (() => {
    if (handPickPurpose === "play_or_skip" && selectedPairType) return selectedPairType;
    const id =
      isMyHandPicking && selectedCardId
        ? selectedCardId
        : focusedHandCardId;
    if (!id) return null;
    return view.myHand.find((c) => c.id === id)?.type ?? null;
  })();

  const handleHandCardTap = (card: GameView["myHand"][0]) => {
    setFocusedHandCardId(card.id);
    if (isMyHandPicking) handleMyCardClick(card);
  };

  const canReorderHand = view.canReorderHand && !isMyHandPicking && !handPickPurpose;
  const hasZangyoInHand = view.myHand.some((c) => c.type === "zangyo");

  return (
    <div className="game-shell">
      {gameMenu}

      <header className="game-topbar">
        <div className="game-topbar__info">
          <span className="game-topbar__code">{room.code}</span>
          <span className="game-topbar__phase">{PHASE_LABELS[view.phase]}</span>
          {current && <span className="game-topbar__turn">手番: {current.name}</span>}
          {view.nomikaiBlocked && <span className="badge">飲み会</span>}
          {view.phase === "play" && view.pairsRemainingThisTurn > 0 && (
            <span className="game-topbar__pairs">ペア×{view.pairsRemainingThisTurn}</span>
          )}
          <DeadlineCountdown deadlineAt={view.deadlineAt} />
        </div>
        {room.cpuWaitingAdvance && (
          <button type="button" className="game-topbar__advance" onClick={onAdvanceCpu}>
            ▶
          </button>
        )}
        <GameMenuButton onClick={() => setMenuOpen(true)} />
      </header>

      <div className="game-main">
        {isSpectating && (
          <div className="spectator-banner" role="status">
            <p className="spectator-banner__title">
              {isObserverMode ? "オブザーバモード" : "定時退社しました"}
            </p>
            <p className="spectator-banner__body">
              {isObserverMode
                ? "全員の手札が見える状態でプレイを観戦しています"
                : "在籍中のプレイヤーの手札がすべて見えます"}
            </p>
          </div>
        )}

        {view.cpuStatus && (
          <div className={`cpu-banner cpu-banner--${view.cpuStatus.step}`}>
            {view.cpuStatus.message}
          </div>
        )}

        {view.lastPlay && (
          <CollapsibleSection
            title={`場: ${CARD_LABELS[view.lastPlay.cardType]}（${view.lastPlay.actorName}）`}
          >
            <div className="field-cards field-cards--compact">
              <div className="field-cards__pair">
                <PlayingCard cardType={view.lastPlay.cardType} />
                <PlayingCard cardType={view.lastPlay.cardType} />
              </div>
              <p className="field-cards__effect">
                <strong>{CARD_LABELS[view.lastPlay.cardType]}</strong>
                {" — "}
                {CARD_EFFECTS[view.lastPlay.cardType]}
              </p>
            </div>
          </CollapsibleSection>
        )}

        {remoteOnMe && view.remoteSelection && (
          <p className="being-targeted">
            {view.remoteSelection.actorName}が
            {view.remoteSelection.mode === "selected"
              ? "あなたのカードを選択中"
              : "あなたのカードにカーソルを合わせています"}
          </p>
        )}

        {anyoneDrawing && (
          <div className={`draw-zone ${isDrawPhase ? "draw-zone--active" : "draw-zone--waiting"}`}>
            {isDrawPhase && myDrawableCards.length > 0 ? (
              <>
                <p className="draw-zone__title">{drawSourceName}の手札から1枚引く</p>
                {pairable.length > 0 && (
                  <p className="draw-zone__pair-hint" role="status">
                    手札にペアがあります。ルール上、先に1枚引いてからペアを出せます
                  </p>
                )}
                <p className="draw-zone__hint">タップで選択 → もう一度タップで引く</p>
                <CardFan className="card-fan--draw">
                  {myDrawableCards.map((c, i) => (
                    <PlayingCard
                      key={c.id}
                      faceDown
                      size="lg"
                      index={i}
                      total={myDrawableCards.length}
                      selectable
                      selected={selectedCardId === c.id}
                      confirmReady={selectedCardId === c.id}
                      onHoverStart={() => sendCardPreview(c.id, "hover")}
                      onHoverEnd={() => sendCardPreview(null, "clear")}
                      onClick={() => handleDrawPick(c.id)}
                    />
                  ))}
                </CardFan>
              </>
            ) : (
              <p className="draw-zone__waiting">
                {current?.name}が{drawSourceName}からカードを引いています…
              </p>
            )}
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
          onTrainingPeekSelect={onTrainingPeekSelect}
          onTrainingPeekConfirm={onTrainingPeekConfirm}
          sendCardPreview={sendCardPreview}
          sendTargetPreview={sendTargetPreview}
        />

        <div className={`opponents ${anyoneDrawing && !isSpectating ? "opponents--compact" : ""}`}>
          {view.seats
            .filter((s) => s.playerId !== playerId)
            .map((s) => (
              <Opponent
                key={s.playerId}
                seat={s}
                isCurrent={s.playerId === view.currentPlayerId}
                isCpu={room.players.find((p) => p.id === s.playerId)?.isCpu ?? false}
                compact={anyoneDrawing && !isSpectating}
                isDrawSource={anyoneDrawing && drawSourceId === s.playerId}
                visibleHand={
                  isObserverMode || isSpectating ? view.otherHands[s.playerId] : undefined
                }
                remoteTarget={
                  view.remoteSelection?.targetPlayerId === s.playerId &&
                  view.remoteSelection.actorId !== playerId
                }
                remoteTargetSelected={
                  view.remoteSelection?.targetPlayerId === s.playerId &&
                  view.remoteSelection.mode === "selected"
                }
              />
            ))}
        </div>

        {view.revealedCard && !view.lastRoukiReveal && (
          <p className="notice">
            公開: {CARD_LABELS[view.revealedCard.type]}（
            {nameOf(view.seats, view.revealedCard.ownerId)}）
          </p>
        )}

        <RoukiRevealOverlay reveal={view.lastRoukiReveal} />

        {Object.keys(view.meetingDeclarations).length > 0 && (
          <p className="notice">
            会議宣言:{" "}
            {Object.entries(view.meetingDeclarations)
              .map(([id]) => `${nameOf(view.seats, id)}「持っています」`)
              .join("、")}
          </p>
        )}

        {view.peekedCards.length > 0 && view.pending?.type === "romance_view" && (
          <div className="peek romance-peek">
            <div className="romance-peek__header">
              <p className="romance-peek__title">
                社内恋愛 — {nameOf(view.seats, view.pending.sourcePlayerId ?? "")}の手札
              </p>
              <DeadlineCountdown deadlineAt={view.deadlineAt} />
            </div>
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
            {view.pending.playerIds.includes(playerId) && (
              <div className="romance-peek__actions">
                {view.pending.romanceSkipped?.[playerId] ? (
                  <p className="status romance-peek__waiting">相手のスキップ待ち…</p>
                ) : (
                  <button type="button" className="secondary" onClick={onRomanceSkip}>
                    確認をスキップ
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {view.peekedCards.length > 0 && view.pending?.type !== "romance_view" && (
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
      </div>

      {isSpectating ? (
        <div className="game-hand-dock game-hand-dock--spectator">
          <p className="spectator-dock-note">
            {isObserverMode ? "オブザーバー — 操作はできません" : "退社済み — 観戦中"}
          </p>
        </div>
      ) : (
      <div
        className={[
          "game-hand-dock",
          isMyHandPicking && view.canAct ? "game-hand-dock--selecting-active" : "",
          handPickPurpose && view.canAct && isPickingFromHand ? "game-hand-dock--selecting" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className={[
            "my-hand",
            hasZangyoInHand ? "my-hand--has-zangyo" : "",
            handPickPurpose && view.canAct && isPickingFromHand
              ? `my-hand--purpose-${handPickPurpose}`
              : "",
            isMyHandPicking && view.canAct ? "my-hand--purpose-active" : "",
            hasHandPickSubmitted ? "my-hand--purpose-waiting" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {hasZangyoInHand && (
            <p className="my-hand__zangyo-banner" role="status">
              残業カードを所持中
            </p>
          )}
          {handPickPurpose && view.canAct && isPickingFromHand && (
            <HandPickHint
              mode={handPickPurpose}
              view={view}
              playerId={playerId}
              submitted={hasHandPickSubmitted}
            />
          )}
          {handPickPurpose === "play_or_skip" && view.canAct && isMyHandPicking && (
            <button type="button" className="my-hand__skip-pair secondary" onClick={onSkipPlay}>
              ペアを出さない
            </button>
          )}
          <div className="my-hand__toolbar">
            <p className="my-hand__label">
              あなたの手札（{me?.handCount ?? 0}枚）
              {me?.status === "retired" && " — 退社済み"}
              {!handPickPurpose && !canReorderHand && view.myHand.length > 0 &&
                " — タップで効果を表示"}
            </p>
            {canReorderHand && view.myHand.length > 1 && (
              <button type="button" className="my-hand__shuffle secondary" onClick={onShuffleHand}>
                シャッフル
              </button>
            )}
          </div>
          {canReorderHand && view.myHand.length > 1 && (
            <p className="status my-hand__hint">ドラッグで並べ替え</p>
          )}
          {!canReorderHand && view.canReorderHand === false && view.myHand.length > 0 && !handPickPurpose && (
            <p className="status my-hand__hint my-hand__hint--locked">
              手札が選ばれている間は並べ替えできません
            </p>
          )}
          {inspectedHandCardType && (
            <CollapsibleSection title={`効果: ${CARD_LABELS[inspectedHandCardType]}`} defaultOpen>
              <CardEffectText cardType={inspectedHandCardType} />
              <p className="hand-card-effect__note">ペアを場に出したときの効果</p>
            </CollapsibleSection>
          )}
          {view.myHand.length > 0 ? (
            canReorderHand ? (
              <ReorderableHandFan
                cards={view.myHand.map((c) => ({ id: c.id, type: c.type }))}
                onReorder={onReorderHand}
                onCardTap={(card) => handleHandCardTap({ id: card.id, type: card.type })}
                focusedCardId={focusedHandCardId}
              />
            ) : (
            <CardFan>
              {view.myHand.map((c, i) => {
                const remote = cardRemoteState(c.id);
                const selected = isMyCardSelected(c);
                return (
                  <PlayingCard
                    key={c.id}
                    cardType={c.type}
                    index={i}
                    total={view.myHand.length}
                    muted={handPickPurpose === "play_or_skip" && !pairable.includes(c.type)}
                    selectable={
                      !canReorderHand &&
                      isMyHandPicking &&
                      !(handPickPurpose === "play_or_skip" && !pairable.includes(c.type))
                    }
                    selected={selected}
                    inspected={!selected && !handPickPurpose && focusedHandCardId === c.id}
                    confirmReady={
                      handPickPurpose === "play_or_skip"
                        ? selectedPairType === c.type
                        : selectedCardId === c.id
                    }
                    remoteHover={remote.remoteHover}
                    remoteSelected={remote.remoteSelected}
                    onHoverStart={
                      isMyHandPicking && view.canAct ? () => sendCardPreview(c.id, "hover") : undefined
                    }
                    onHoverEnd={
                      isMyHandPicking && view.canAct ? () => sendCardPreview(null, "clear") : undefined
                    }
                    onClick={() => handleHandCardTap(c)}
                  />
                );
              })}
            </CardFan>
            )
          ) : (
            <p className="status">手札なし</p>
          )}
        </div>
      </div>
      )}

      {transferFx && transferFx.fromPlayerId === playerId && transferFx.cardType && (
        <div className="card-transfer-fx card-transfer-fx--out">
          <PlayingCard cardType={transferFx.cardType} removing />
          <span className="card-transfer-fx__label">カードが取られた</span>
        </div>
      )}
      {transferFx && transferFx.toPlayerId === playerId && transferFx.cardType && (
        <div className="card-transfer-fx card-transfer-fx--in">
          <PlayingCard cardType={transferFx.cardType} />
          <span className="card-transfer-fx__label">カードをもらった</span>
        </div>
      )}
    </div>
  );
}

function ActivityLogList({ entries }: { entries: GameView["activityLog"] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, entries[entries.length - 1]?.id]);

  return (
    <div className="activity-log activity-log--menu" ref={ref}>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.cardType && (
              <span className="card-chip small">{CARD_LABELS[entry.cardType]}</span>
            )}
            {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeadlineCountdown({ deadlineAt }: { deadlineAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  if (!deadlineAt) return null;

  const remaining = Math.max(0, Math.ceil((deadlineAt - now) / 1000));
  const urgent = remaining <= 5;

  return (
    <span className={`deadline-timer ${urgent ? "deadline-timer--urgent" : ""}`}>
      残り {remaining}秒
    </span>
  );
}

function Opponent({
  seat,
  isCurrent,
  isCpu,
  compact,
  isDrawSource,
  visibleHand,
  remoteTarget,
  remoteTargetSelected,
}: {
  seat: GameView["seats"][0];
  isCurrent: boolean;
  isCpu: boolean;
  compact?: boolean;
  isDrawSource?: boolean;
  visibleHand?: GameView["myHand"];
  remoteTarget?: boolean;
  remoteTargetSelected?: boolean;
}) {
  const previewCount = Math.min(seat.handCount, 4);
  const opponentClass = [
    "opponent",
    compact ? "opponent--compact" : "",
    visibleHand ? "opponent--spectator" : "",
    isCurrent ? "current" : "",
    isDrawSource ? "opponent--draw-source" : "",
    seat.status,
    remoteTargetSelected ? "remote-target-selected" : "",
    remoteTarget && !remoteTargetSelected ? "remote-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={opponentClass}>
      <div className="opponent__header">
        <strong>
          {seat.name}
          {isCpu && <span className="cpu-tag">CPU</span>}
        </strong>
        <span>{seat.handCount}枚</span>
      </div>
      {visibleHand && visibleHand.length > 0 && (
        <CardFan className="card-fan--spectator">
          {visibleHand.map((c, i) => (
            <PlayingCard
              key={c.id}
              cardType={c.type}
              size="sm"
              index={i}
              total={visibleHand.length}
            />
          ))}
        </CardFan>
      )}
      {visibleHand && visibleHand.length === 0 && (
        <p className="status opponent__empty-hand">手札なし</p>
      )}
      {compact && previewCount > 0 && !visibleHand && (
        <div className="opponent__hand-preview" aria-hidden>
          {Array.from({ length: previewCount }, (_, i) => (
            <span
              key={i}
              className="opponent__mini-card"
              style={{ ["--mini-index" as string]: i }}
            />
          ))}
        </div>
      )}
      {seat.status === "retired" && <span>退社</span>}
      {seat.autoPlay && <span className="opponent__auto-play">自動プレイ</span>}
      {seat.status === "disconnected" && !seat.autoPlay && <span>切断</span>}
      {isDrawSource && compact && <span className="opponent__draw-badge">引く相手</span>}
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
  onTrainingPeekSelect,
  onTrainingPeekConfirm,
  sendCardPreview,
  sendTargetPreview,
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
  onTrainingPeekSelect: (cardId: string) => void;
  onTrainingPeekConfirm: () => void;
  sendCardPreview: (cardId: string | null, mode: "hover" | "selected" | "clear") => void;
  sendTargetPreview: (targetId: string | null, mode: "hover" | "selected" | "clear") => void;
}) {
  if (!view.canAct || !view.pending) {
    if (view.pending?.type === "draw") return null;
    return view.pending ? <p className="status">他のプレイヤーの操作を待っています…</p> : null;
  }

  const p = view.pending;

  if (p.type === "draw") return null;

  if (p.type === "play_or_skip") {
    const extraPair = view.pairsRemainingThisTurn > 1;
    const onlyPair = pairable.length === 1 && view.myHand.length === 2;
    return (
      <div className="actions">
        <p>{extraPair ? "もう1組ペアを出しますか？" : "ペアを出しますか？"}</p>
        {onlyPair && (
          <p className="status actions__pair-ready" role="status">
            手札2枚が揃っています。ペアを出すか「ペアを出さない」を選んでください
          </p>
        )}
        <p className="status">手札のカードを2回タップ、または下のペアから選んでください</p>
        {pairable.length > 0 ? (
          <>
            <div className="pair-row">
              {pairable.map((t) => (
                <PairCard
                  key={t}
                  cardType={t}
                  selectable
                  selected={selectedPairType === t}
                  confirmReady={selectedPairType === t}
                  onClick={() => {
                    if (selectedPairType === t) {
                      onPlayPair(t);
                      onSelectPairType(null);
                    } else {
                      onSelectPairType(t);
                    }
                  }}
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
          </>
        ) : (
          <p className="status">出せるペアがありません</p>
        )}
        <button type="button" className="secondary" onClick={onSkipPlay}>
          ペアを出さない
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
              onPointerEnter={() => sendTargetPreview(id, "hover")}
              onPointerLeave={() => sendTargetPreview(null, "clear")}
              onClick={() =>
                twoStepPick(id, selectedTargetId, onSelectTargetId, onSelectTarget, (tid) =>
                  sendTargetPreview(tid, "selected"),
                )
              }
            >
              {nameOf(view.seats, id)}
            </button>
          ))}
        </div>
        <p className="status">タップで選択 → もう一度タップで確定</p>
      </div>
    );
  }

  if (p.type === "select_card" && p.validCardIds) {
    if (view.effectCard === "pawahara") {
      return null;
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
              onHoverStart={() => sendCardPreview(item.id, "hover")}
              onHoverEnd={() => sendCardPreview(null, "clear")}
              onClick={() =>
                twoStepPick(item.id, selectedCardId, onSelectCardId, onSelectCard, (cid) =>
                  sendCardPreview(cid, "selected"),
                )
              }
            />
          ))}
        </CardFan>
      </div>
    );
  }

  if (p.type === "info_share") {
    return null;
  }

  if (p.type === "trade") {
    return null;
  }

  if (p.type === "training_peek" && p.validCardIds) {
    const max = p.trainingPeekMax ?? 2;
    const selected = new Set(p.trainingPeekSelected ?? []);
    const targetName = p.sourcePlayerId ? nameOf(view.seats, p.sourcePlayerId) : "相手";
    return (
      <div className="actions">
        <p>
          {targetName}の手札から見るカードを選ぶ（{max === 1 ? "1枚" : `最大${max}枚`}）
        </p>
        <p className="status">
          {max === 1
            ? "相手の手札が1枚のため自動で見ます"
            : `タップで選択・解除 — ${selected.size}/${max}枚`}
        </p>
        <CardFan>
          {p.validCardIds.map((id, i) => (
            <PlayingCard
              key={id}
              faceDown
              index={i}
              total={p.validCardIds!.length}
              selectable
              selected={selected.has(id)}
              confirmReady={selected.has(id)}
              onHoverStart={() => sendCardPreview(id, "hover")}
              onHoverEnd={() => sendCardPreview(null, "clear")}
              onClick={() => onTrainingPeekSelect(id)}
            />
          ))}
        </CardFan>
        <button
          type="button"
          className="action-confirm"
          disabled={selected.size === 0}
          onClick={onTrainingPeekConfirm}
        >
          選んだカードを見る
        </button>
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
                twoStepPick(c.id, selectedCardId, onSelectCardId, (id) => onTrainingTake(true, id))
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
  onFirstSelect?: (id: string) => void,
) {
  if (selectedId === cardId) {
    onConfirm(cardId);
    setSelectedId(null);
  } else {
    onFirstSelect?.(cardId);
    setSelectedId(cardId);
  }
}

function getCardTargetPlayerId(view: GameView): string | null {
  const p = view.pending;
  if (!p) return null;
  if (p.type === "draw") return p.sourcePlayerId ?? null;
  if (p.type === "select_card") return p.sourcePlayerId ?? null;
  if (p.type === "training_peek") return p.sourcePlayerId ?? null;
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
