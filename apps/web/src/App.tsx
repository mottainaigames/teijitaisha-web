import type { GameView } from "@teijitaisha/shared";
import { MAX_PLAYER_NAME_LENGTH, ROOM_CODE_LENGTH } from "@teijitaisha/shared";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useGameSocket } from "./useGameSocket";
import { GameScreen } from "./GameScreen";
import { ProductAdBanner } from "./product-ad";
import { HomePromoShareButton, MottainaiLinks } from "./social-promo";
import { HomeRules } from "./home-rules";

type HomeMode = "join" | "create";

function readInviteCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  const code = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase() ?? "";
  return code.length === ROOM_CODE_LENGTH ? code : "";
}

export default function App() {
  const {
    screen,
    playerName,
    setPlayerName,
    joinCode,
    setJoinCode,
    room,
    gameView,
    playerId,
    error,
    connected,
    reconnecting,
    send,
    createRoom,
    joinRoom,
    leaveRoom,
    returnToLobby,
    cycleCpuSpeed,
    advanceCpu,
    goHome,
  } = useGameSocket();

  const [invitedViaLink, setInvitedViaLink] = useState(() => Boolean(readInviteCodeFromUrl()));
  const [homeMode, setHomeMode] = useState<HomeMode>(() =>
    readInviteCodeFromUrl() ? "join" : "join",
  );

  useEffect(() => {
    const code = readInviteCodeFromUrl();
    if (code) {
      setJoinCode(code);
      setInvitedViaLink(true);
      setHomeMode("join");
    }
  }, [setJoinCode]);

  useEffect(() => {
    if (joinCode.trim().length > 0) {
      setHomeMode("join");
    }
  }, [joinCode]);

  const trimmedName = playerName.trim();
  const trimmedCode = joinCode.trim().toUpperCase();
  const canJoin =
    connected && trimmedName.length > 0 && trimmedCode.length >= ROOM_CODE_LENGTH;
  const canCreate = connected && trimmedName.length > 0 && trimmedCode.length === 0;

  const handleJoinKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !canJoin) return;
    e.preventDefault();
    joinRoom(false);
  };

  const me = room?.players.find((p) => p.id === playerId);
  const showingLobby = Boolean(room && me && (!room.started || me.inLobby));

  const lobbyView: GameView | null =
    room && playerId
      ? {
          phase: "lobby",
          seats: room.players
            .filter((p) => !p.isObserver)
            .map((p) => ({
              playerId: p.id,
              name: p.name,
              status: p.status,
              handCount: p.handCount,
              seatIndex: p.seatIndex,
            })),
          currentPlayerId: null,
          myPlayerId: playerId,
          myHand: [],
          drawableHands: {},
          otherHands: {},
          discardTypes: [],
          pairsRemainingThisTurn: 1,
          nomikaiBlocked: false,
          effectCard: null,
          effectStep: "none",
          pending: null,
          result: null,
          revealedCard: null,
          meetingDeclarations: {},
          peekedCards: [],
          canAct: false,
          canReorderHand: false,
          deadlineAt: null,
          activityLog: [],
          cpuStatus: null,
          lastPlay: null,
          remoteSelection: null,
          lastTransfer: null,
          lastRoukiReveal: null,
          isObserver: room.players.some((p) => p.id === playerId && p.isObserver),
        }
      : null;

  const view = showingLobby ? lobbyView : gameView;
  const showRejoinFallback = screen === "game" && !room;

  return (
    <div className={`app${screen === "game" && room ? " app--in-game" : ""}`}>
      <div className="app-brand">
        <h1>定時退社Web版</h1>
      </div>

      {!showRejoinFallback && !connected && reconnecting && (
        <p className="status">再接続中…</p>
      )}
      {!showRejoinFallback && !connected && !reconnecting && (
        <p className="status">サーバー接続中…</p>
      )}
      {!showRejoinFallback && connected && reconnecting && screen === "game" && (
        <p className="status">ルームに復帰しています…</p>
      )}
      {!showRejoinFallback && error && <p className="error">{error}</p>}

      {showRejoinFallback && (
        <div className="card rejoin-fallback">
          {!connected && reconnecting && <p className="status">再接続中…</p>}
          {connected && reconnecting && <p className="status">ルームに復帰しています…</p>}
          {!reconnecting && (
            <p className="status">
              {error ?? "ルームに復帰できませんでした。ルームが終了したか、セッションが無効になっている可能性があります。"}
            </p>
          )}
          {error && reconnecting && <p className="error">{error}</p>}
          <button type="button" className="secondary" onClick={goHome}>
            ホームに戻る
          </button>
        </div>
      )}

      {screen === "home" && (
        <>
          <ProductAdBanner className="product-ad-banner--home" />
          <div className="card home-entry">
            <label htmlFor="name">表示名</label>
            <input
              id="name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="社員名"
              maxLength={MAX_PLAYER_NAME_LENGTH}
              autoComplete="nickname"
            />

            <div className="home-entry-tabs" role="tablist" aria-label="ルーム操作">
              <button
                type="button"
                role="tab"
                id="home-tab-join"
                aria-selected={homeMode === "join"}
                aria-controls="home-panel-join"
                className={homeMode === "join" ? "home-entry-tabs__tab--active" : undefined}
                onClick={() => setHomeMode("join")}
              >
                ルームに参加
              </button>
              <button
                type="button"
                role="tab"
                id="home-tab-create"
                aria-selected={homeMode === "create"}
                aria-controls="home-panel-create"
                className={homeMode === "create" ? "home-entry-tabs__tab--active" : undefined}
                onClick={() => setHomeMode("create")}
              >
                ルームを作成
              </button>
            </div>

            {homeMode === "join" ? (
              <section
                id="home-panel-join"
                role="tabpanel"
                aria-labelledby="home-tab-join"
                className="home-entry-panel"
              >
                <p className="home-entry-hint">
                  ホストから共有された6文字のルームコードを入力してください。
                </p>
                <label htmlFor="code">ルームコード</label>
                {invitedViaLink && trimmedCode.length >= ROOM_CODE_LENGTH && (
                  <p className="status invite-hint">招待リンクからルームコードが入力されました</p>
                )}
                <input
                  id="code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={handleJoinKeyDown}
                  placeholder="ABC123"
                  maxLength={ROOM_CODE_LENGTH}
                  autoComplete="off"
                  inputMode="text"
                  spellCheck={false}
                  autoCapitalize="characters"
                />
                <button
                  type="button"
                  className="home-entry-action"
                  onClick={() => joinRoom(false)}
                  disabled={!canJoin}
                >
                  参加する（プレイヤー）
                </button>
                <button
                  type="button"
                  className="secondary home-join-observe"
                  onClick={() => joinRoom(true)}
                  disabled={!canJoin}
                >
                  オブザーバーとして参加
                </button>
              </section>
            ) : (
              <section
                id="home-panel-create"
                role="tabpanel"
                aria-labelledby="home-tab-create"
                className="home-entry-panel"
              >
                <p className="home-entry-hint">
                  新しいルームを作成し、表示されるコードを友達に共有します。
                </p>
                {trimmedCode.length > 0 && (
                  <p className="home-entry-warning" role="status">
                    ルームコードが入力されています。既存のルームに入る場合は「ルームに参加」を選んでください。
                  </p>
                )}
                <button
                  type="button"
                  className="home-entry-action"
                  onClick={createRoom}
                  disabled={!canCreate}
                >
                  ルームを作成
                </button>
              </section>
            )}

            <HomePromoShareButton />
          </div>
          <HomeRules />
        </>
      )}

      {screen === "game" && room && playerId && view && (
        <GameScreen
          room={room}
          view={view}
          playerId={playerId}
          onStart={() => send({ type: "start_game" })}
          onAddCpu={() => send({ type: "add_cpu" })}
          onRemoveCpu={() => send({ type: "remove_cpu" })}
          onDraw={(cardId) => send({ type: "draw_card", cardId })}
          onPlayPair={(cardType) => send({ type: "play_pair", cardType })}
          onSkipPlay={() => send({ type: "skip_play" })}
          onSelectTarget={(targetId) => send({ type: "select_target", targetId })}
          onSelectCard={(cardId) => send({ type: "select_card", cardId })}
          onInfoShare={(cardId) => send({ type: "info_share_select", cardId })}
          onTrade={(cardId) => send({ type: "trade_select", cardId })}
          onTrainingTake={(take, cardId) => send({ type: "training_take", take, cardId })}
          onTrainingPeekSelect={(cardId) => send({ type: "training_peek_select", cardId })}
          onTrainingPeekConfirm={() => send({ type: "training_peek_confirm" })}
          onSelectionPreview={(payload) => send({ type: "selection_preview", ...payload })}
          onLeave={leaveRoom}
          onReturnToLobby={returnToLobby}
          onCycleCpuSpeed={cycleCpuSpeed}
          onAdvanceCpu={advanceCpu}
          onRomanceSkip={() => send({ type: "romance_skip" })}
          onShuffleHand={() => send({ type: "shuffle_hand" })}
          onReorderHand={(cardIds) => send({ type: "reorder_hand", cardIds })}
          onReorderSeats={(playerIds) => send({ type: "reorder_seats", playerIds })}
          onShuffleSeats={() => send({ type: "shuffle_seats" })}
          onKickPlayer={(targetPlayerId) => send({ type: "kick_player", targetPlayerId })}
          onSetPlayerStyle={(style) => send({ type: "set_player_style", ...style })}
        />
      )}

      {!(screen === "game" && room) && (
        <footer className="app-footer">
          <MottainaiLinks className="mottainai-links--footer" />
          <p className="app-footer__copy">© MottainaiGames 2026</p>
        </footer>
      )}
    </div>
  );
}
