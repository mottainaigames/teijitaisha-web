import { useCallback, useEffect, useRef, useState } from "react";
import type { GameView, RoomPublic, ServerMessage } from "@teijitaisha/shared";
import { normalizePlayerName } from "@teijitaisha/shared";
import { clearSession, loadSession, saveSession, type StoredSession } from "./session";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 30_000;
/** 意図的な切断（アンマウント等） */
const WS_CLOSE_INTENTIONAL = 4001;

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
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnectRef = useRef(true);
  const unmountedRef = useRef(false);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

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
        case "pong":
          break;
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
          reconnectDelayRef.current = RECONNECT_BASE_MS;
          break;
        case "room_updated":
          setRoom(data.room);
          if (!data.room.started) {
            setGameView(null);
          }
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
        case "session_replaced":
          clearSession();
          sessionRef.current = null;
          setRoom(null);
          setGameView(null);
          setPlayerId(null);
          setScreen("home");
          setReconnecting(false);
          setError(data.message);
          break;
        case "game_started":
          setRoom(data.room);
          setScreen("game");
          break;
        case "game_state":
          setGameView(data.view);
          setScreen("game");
          setReconnecting(false);
          reconnectDelayRef.current = RECONNECT_BASE_MS;
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

  const handleServerMessageRef = useRef(handleServerMessage);
  handleServerMessageRef.current = handleServerMessage;

  const startPing = useCallback((ws: WebSocket) => {
    clearPingTimer();
    pingTimerRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }, [clearPingTimer]);

  const openSocketRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current || !shouldReconnectRef.current) return;
    if (reconnectTimerRef.current) return;

    if (sessionRef.current) {
      setReconnecting(true);
    }

    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
      openSocketRef.current();
    }, delay);
  }, []);

  const openSocket = useCallback(() => {
    const existing = wsRef.current;
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearReconnectTimer();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setConnected(true);
      setError(null);
      startPing(ws);

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
      } else {
        setReconnecting(false);
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      clearPingTimer();
      setConnected(false);

      if (event.code === WS_CLOSE_INTENTIONAL || unmountedRef.current || !shouldReconnectRef.current) {
        return;
      }

      scheduleReconnect();
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      if (sessionRef.current) {
        setError("サーバーに接続できません。再接続しています…");
      } else {
        setError("サーバーに接続できません");
      }
    };

    ws.onmessage = (event) => {
      let data: ServerMessage;
      try {
        data = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        setError("サーバーからの応答を読み取れませんでした");
        return;
      }
      if (!data || typeof data !== "object" || !("type" in data)) {
        return;
      }
      handleServerMessageRef.current(data);
    };
  }, [clearPingTimer, clearReconnectTimer, scheduleReconnect, startPing]);

  openSocketRef.current = openSocket;

  useEffect(() => {
    unmountedRef.current = false;
    shouldReconnectRef.current = true;
    reconnectDelayRef.current = RECONNECT_BASE_MS;
    openSocket();

    return () => {
      unmountedRef.current = true;
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      clearPingTimer();
      const ws = wsRef.current;
      if (ws) {
        wsRef.current = null;
        ws.close(WS_CLOSE_INTENTIONAL);
      }
    };
  }, [clearPingTimer, clearReconnectTimer, openSocket]);

  const send = useCallback(
    (payload: object) => {
      const ws = wsRef.current;
      const json = JSON.stringify(payload);

      const deliver = (socket: WebSocket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(json);
        }
      };

      if (ws?.readyState === WebSocket.OPEN) {
        deliver(ws);
        return;
      }

      openSocket();
      const active = wsRef.current;
      if (!active) return;

      if (active.readyState === WebSocket.OPEN) {
        deliver(active);
      } else {
        active.addEventListener("open", () => deliver(active), { once: true });
      }
    },
    [openSocket],
  );

  const createRoom = useCallback(() => {
    setError(null);
    send({ type: "create_room", playerName: normalizePlayerName(playerName) });
  }, [playerName, send]);

  const joinRoom = useCallback(() => {
    setError(null);
    send({
      type: "join_room",
      code: joinCode.trim().toUpperCase(),
      playerName: normalizePlayerName(playerName),
    });
  }, [joinCode, playerName, send]);

  const leaveRoom = useCallback(() => {
    send({ type: "leave_room" });
  }, [send]);

  const returnToLobby = useCallback(() => {
    send({ type: "return_to_lobby" });
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
    returnToLobby,
    cycleCpuSpeed,
    advanceCpu,
    goHome,
  };
}
