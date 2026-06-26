import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameView,
  RoomPublic,
  ServerMessage,
} from "@teijitaisha/shared";
import { GameScreen } from "./GameScreen";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

type Screen = "home" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [gameView, setGameView] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const existing = wsRef.current;
    if (
      existing?.readyState === WebSocket.OPEN ||
      existing?.readyState === WebSocket.CONNECTING
    ) {
      return existing;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setConnected(true);
      setError(null);
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnected(false);
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError("サーバーに接続できません");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      switch (data.type) {
        case "room_created":
        case "room_joined":
          setRoom(data.room);
          setPlayerId(data.playerId);
          setScreen("game");
          setError(null);
          break;
        case "room_updated":
          setRoom(data.room);
          break;
        case "game_started":
          setRoom(data.room);
          setScreen("game");
          break;
        case "game_state":
          setGameView(data.view);
          setScreen("game");
          break;
        case "error":
          setError(data.message);
          break;
      }
    };

    return ws;
  }, []);

  useEffect(() => {
    const ws = connect();
    return () => {
      if (wsRef.current === ws) wsRef.current = null;
      ws.close();
    };
  }, [connect]);

  const send = (payload: object) => {
    const ws = connect();
    const json = JSON.stringify(payload);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    } else {
      ws.addEventListener("open", () => ws.send(json), { once: true });
    }
  };

  const handleCreate = () => {
    setError(null);
    send({ type: "create_room", playerName });
  };

  const handleJoin = () => {
    setError(null);
    send({ type: "join_room", code: joinCode.trim().toUpperCase(), playerName });
  };

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
          deadlineAt: null,
          activityLog: [],
          cpuStatus: null,
          lastPlay: null,
          remoteSelection: null,
          lastTransfer: null,
        }
      : null;

  const view = gameView ?? lobbyView;

  return (
    <div className="app">
      <h1>定時退社</h1>
      <p className="subtitle">Mottainai Games — Web版</p>

      {!connected && <p className="status">サーバー接続中…</p>}
      {error && <p className="error">{error}</p>}

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
          <button
            type="button"
            onClick={handleCreate}
            disabled={!connected || !playerName.trim()}
          >
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
            onClick={handleJoin}
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
        />
      )}
    </div>
  );
}
