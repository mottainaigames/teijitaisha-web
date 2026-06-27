import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, RoomPublic, ServerMessage } from "@teijitaisha/shared";
import { clearSession, loadSession, saveSession, type StoredSession } from "./session";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

type Screen = "home" | "game";

export function useGameSocket() {
  const initialSession = loadSession();
  const [screen, setScreen] = useState<Screen>(() => (initialSession ? "game" : "home"));
  const [playerName, setPlayerName] = useState(() => initialSession?.playerName ?? "");
  const [joinCode, setJoinCode] = useState(() => initialSession?.code ?? "");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [gameView, setGameView] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() => initialSession?.playerId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(() => !!initialSession);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<StoredSession | null>(initialSession);
  const playerNameRef = useRef(playerName);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  const persistSession = useCallback((session: StoredSession) => {
    sessionRef.current = session;
    saveSession(session);
    setPlayerName(session.playerName);
    setJoinCode(session.code);
  }, []);

  const goHome = useCallback(() => {
    clearSession();
    sessionRef.current = null;
    setRoom(null);
    setGameView(null);
    setPlayerId(null);
    setScreen("home");
    setError(null);
    setReconnecting(false);
  }, []);

  const handleServerMessage = useCallback(
    (data: ServerMessage) => {
      switch (data.type) {
        case "room_created":
        case "room_joined":
        case "room_rejoined":
          persistSession({
            code: data.room.code,
            playerId: data.playerId,
            sessionToken: data.sessionToken,
            playerName:
              data.type === "room_rejoined"
                ? (sessionRef.current?.playerName ?? playerNameRef.current)
                : playerNameRef.current.trim() || "社員",
          });
          setRoom(data.room);
          setPlayerId(data.playerId);
          setScreen("game");
          setError(null);
          setReconnecting(false);
          break;
        case "room_updated":
          setRoom(data.room);
          break;
        case "room_left":
          clearSession();
          sessionRef.current = null;
          setRoom(null);
          setGameView(null);
          setPlayerId(null);
          setScreen("home");
          setError(null);
          setReconnecting(false);
          break;
        case "game_started":
          setRoom(data.room);
          setScreen("game");
          break;
        case "game_state":
          setGameView(data.view);
          setScreen("game");
          setReconnecting(false);
          break;
        case "error":
          if (sessionRef.current) {
            setReconnecting(false);
          }
          if (data.message.includes("セッション")) {
            clearSession();
            sessionRef.current = null;
            setScreen("home");
            setRoom(null);
            setGameView(null);
            setPlayerId(null);
          }
          setError(data.message);
          break;
      }
    },
    [persistSession],
  );

  const connect = useCallback(() => {
    const existing = wsRef.current;
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return existing;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setConnected(true);
      setError(null);

      const session = sessionRef.current;
      if (session) {
        setReconnecting(true);
        ws.send(
          JSON.stringify({
            type: "rejoin_room",
            code: session.code,
            sessionToken: session.sessionToken,
          }),
        );
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnected(false);
      if (sessionRef.current) {
        setReconnecting(true);
      }
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError("サーバーに接続できません");
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ServerMessage;
      handleServerMessage(data);
    };

    return ws;
  }, [handleServerMessage]);

  useEffect(() => {
    const ws = connect();
    return () => {
      if (wsRef.current === ws) wsRef.current = null;
      ws.close();
    };
  }, [connect]);

  const send = useCallback(
    (payload: object) => {
      const ws = connect();
      const json = JSON.stringify(payload);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      } else {
        ws.addEventListener("open", () => ws.send(json), { once: true });
      }
    },
    [connect],
  );

  const createRoom = useCallback(() => {
    setError(null);
    setReconnecting(false);
    send({ type: "create_room", playerName });
  }, [playerName, send]);

  const joinRoom = useCallback(() => {
    setError(null);
    setReconnecting(false);
    send({ type: "join_room", code: joinCode.trim().toUpperCase(), playerName });
  }, [joinCode, playerName, send]);

  const leaveRoom = useCallback(() => {
    send({ type: "leave_room" });
  }, [send]);

  const cycleCpuSpeed = useCallback(() => {
    send({ type: "cycle_cpu_speed" });
  }, [send]);

  const advanceCpu = useCallback(() => {
    send({ type: "advance_cpu" });
  }, [send]);

  return {
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
    cycleCpuSpeed,
    advanceCpu,
    goHome,
  };
}
