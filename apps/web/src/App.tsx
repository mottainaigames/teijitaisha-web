import type { GameView } from "@teijitaisha/shared";
import { useGameSocket } from "./useGameSocket";
import { GameScreen } from "./GameScreen";

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

  const lobbyView: GameView | null =
    room && playerId
      ? {
          phase: "lobby",
          seats: room.players.map((p) => ({
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
        }
      : null;

  const view = gameView ?? lobbyView;
  const showRejoinFallback = screen === "game" && !room;

  return (
    <div className={`app${screen === "game" && room ? " app--in-game" : ""}`}>
      <div className="app-brand">
        <h1>定時退社</h1>
        <p className="subtitle">Mottainai Games — Web版</p>
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
        <div className="card">
          <label htmlFor="name">表示名</label>
          <input
            id="name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="社員名"
            maxLength={20}
          />
          <button type="button" onClick={createRoom} disabled={!connected || !playerName.trim()}>
            ルームを作成
          </button>
          <label htmlFor="code" style={{ marginTop: "1rem" }}>
            ルームコード
          </label>
          <input
            id="code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
          />
          <button
            type="button"
            className="secondary"
            onClick={joinRoom}
            disabled={!connected || !playerName.trim() || joinCode.length < 6}
          >
            ルームに参加
          </button>
        </div>
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
          onSelectionPreview={(payload) => send({ type: "selection_preview", ...payload })}
          onLeave={leaveRoom}
          onReturnToLobby={returnToLobby}
          onCycleCpuSpeed={cycleCpuSpeed}
          onAdvanceCpu={advanceCpu}
          onRomanceSkip={() => send({ type: "romance_skip" })}
          onShuffleHand={() => send({ type: "shuffle_hand" })}
          onReorderHand={(cardIds) => send({ type: "reorder_hand", cardIds })}
        />
      )}
    </div>
  );
}
