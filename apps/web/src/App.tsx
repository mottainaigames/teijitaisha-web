import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPublic, ServerMessage } from "@teijitaisha/shared";
import { MIN_PLAYERS, MAX_PLAYERS } from "@teijitaisha/shared";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

type Screen = "home" | "lobby";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("サーバーに接続できません");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      switch (data.type) {
        case "room_created":
        case "room_joined":
          setRoom(data.room);
          setPlayerId(data.playerId);
          setScreen("lobby");
          setError(null);
          break;
        case "room_updated":
          setRoom(data.room);
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
    return () => ws.close();
  }, [connect]);

  const send = (payload: object) => {
    const ws = connect();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      ws.addEventListener("open", () => ws.send(JSON.stringify(payload)), { once: true });
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

  const isHost = room && playerId === room.hostId;

  return (
    <div className="app">
      <h1>定時退社</h1>
      <p className="subtitle">Mottainai Games — Web版（MVP）</p>

      {!connected && <p className="status">サーバー接続中…</p>}

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
          {error && <p className="error">{error}</p>}
          <button type="button" onClick={handleCreate} disabled={!connected || !playerName.trim()}>
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

      {screen === "lobby" && room && (
        <div className="card">
          <p className="status">{isHost ? "あなたがホストです" : "ルームに参加しました"}</p>
          <p className="room-code">{room.code}</p>
          <p className="status" style={{ textAlign: "center" }}>
            このコードを共有してください
          </p>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === room.hostId && "（ホスト）"}
                <span className="status"> — {p.status}</span>
              </li>
            ))}
          </ul>
          <p className="status" style={{ marginTop: "1rem" }}>
            {room.players.length} / {MAX_PLAYERS} 人（{MIN_PLAYERS}人から開始可能）
          </p>
          {isHost && (
            <button type="button" disabled>
              ゲームを開始（未実装）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
