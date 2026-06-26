import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@teijitaisha/shared";
import { createApp, type AppHandle } from "./app.js";

function waitForMessage(ws: WebSocket, type: string, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);

    const handler = (raw: WebSocket.RawData) => {
      const data = JSON.parse(String(raw)) as ServerMessage;
      if (data.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(data);
      }
    };

    ws.on("message", handler);
  });
}

function openSocket(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("WebSocket integration", () => {
  let app: AppHandle;

  beforeAll(async () => {
    app = await createApp({ port: 0 });
  }, 10_000);

  afterAll(async () => {
    await app.close();
  });

  it("ルーム作成→参加→再接続の流れ", async () => {
    const hostWs = await openSocket(app.port);
    hostWs.send(JSON.stringify({ type: "create_room", playerName: "ホスト" }));
    const created = (await waitForMessage(hostWs, "room_created")) as Extract<
      ServerMessage,
      { type: "room_created" }
    >;

    const guestWs = await openSocket(app.port);
    guestWs.send(
      JSON.stringify({
        type: "join_room",
        code: created.room.code,
        playerName: "ゲスト",
      }),
    );
    const joined = (await waitForMessage(guestWs, "room_joined")) as Extract<
      ServerMessage,
      { type: "room_joined" }
    >;
    expect(joined.room.players).toHaveLength(2);

    guestWs.close();
    await new Promise((r) => setTimeout(r, 50));

    const rejoinWs = await openSocket(app.port);
    rejoinWs.send(
      JSON.stringify({
        type: "rejoin_room",
        code: created.room.code,
        sessionToken: joined.sessionToken,
      }),
    );
    const rejoined = (await waitForMessage(rejoinWs, "room_rejoined")) as Extract<
      ServerMessage,
      { type: "room_rejoined" }
    >;
    expect(rejoined.playerId).toBe(joined.playerId);

    hostWs.close();
    rejoinWs.close();
  });

  it("/health が応答する", async () => {
    const res = await fetch(`http://127.0.0.1:${app.port}/health`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { ok: boolean; rooms: number };
    expect(body.ok).toBe(true);
    expect(typeof body.rooms).toBe("number");
  });
});
