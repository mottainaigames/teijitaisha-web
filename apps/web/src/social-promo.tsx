import { useCallback, useState } from "react";
import type { GameResult, SeatPublic } from "@teijitaisha/shared";

export const MOTTAINAI_HP_URL = "https://mottainaigames.com";
export const MOTTAINAI_X_HANDLE = "@MottainaiGames";
export const MOTTAINAI_X_URL = "https://x.com/MottainaiGames";

const DEFAULT_APP_URL = "https://teijitaisha-web.mottainaigames.com";

export function getAppBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_APP_URL;
}

export function buildInviteUrl(roomCode: string): string {
  return `${getAppBaseUrl()}/?code=${encodeURIComponent(roomCode.toUpperCase())}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function openXShare(text: string): void {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function buildHomePromoTweet(): string {
  const appUrl = getAppBaseUrl();
  return [
    "ブラウザでボードゲーム「定時退社」が遊べる！",
    "",
    "ルームを作って友達を招待して対戦しよう",
    appUrl,
    "",
    MOTTAINAI_X_HANDLE,
    "#定時退社 #定時退社Web",
  ].join("\n");
}

export function buildInviteTweet(roomCode: string): string {
  const inviteUrl = buildInviteUrl(roomCode);
  return [
    "「定時退社」で一緒に遊ぼう！",
    "",
    `ルームコード: ${roomCode.toUpperCase()}`,
    "",
    "参加はこちら▼",
    inviteUrl,
    "",
    "#定時退社",
  ].join("\n");
}

function seatName(seats: SeatPublic[], playerId: string): string {
  return seats.find((s) => s.playerId === playerId)?.name ?? "???";
}

export function buildGameResultTweet(params: {
  playerId: string;
  playerName: string;
  result: GameResult;
  seats: SeatPublic[];
  roomCode: string;
}): string {
  const { playerId, playerName, result, seats, roomCode } = params;
  const rankIndex = result.retirementOrder.indexOf(playerId);
  const rankLine = rankIndex >= 0 ? `${rankIndex + 1}位` : null;

  let outcome: string;
  let winMethod: string | null = null;

  if (result.reason === "rouki") {
    if (result.roukiPlayerId === playerId) {
      outcome = "勝利！";
      winMethod = "労基で残業を摘発";
    } else if (result.zangyoPlayerId === playerId) {
      outcome = "敗北…";
    } else if (result.drawIds?.includes(playerId)) {
      outcome = "引き分け";
    } else {
      outcome = rankLine ? `${rankLine}で退社` : "参加";
    }
  } else if (result.winnerIds.includes(playerId)) {
    outcome = "勝利！";
    winMethod = "退社";
  } else if (result.loserIds.includes(playerId)) {
    outcome = "敗北…";
  } else {
    outcome = rankLine ? `${rankLine}で退社` : "参加";
  }

  const resultParts = [rankLine, outcome].filter(Boolean);
  const resultLine = `${playerName}の結果: ${resultParts.join(" / ")}`;
  const methodLine = winMethod ? `勝ち方: ${winMethod}` : null;

  const inviteUrl = buildInviteUrl(roomCode);
  const lines = [
    "「定時退社」Webでプレイしました！",
    "",
    resultLine,
    ...(methodLine ? [methodLine] : []),
    "",
    "一緒に遊ぶならこちら▼",
    inviteUrl,
    "",
    MOTTAINAI_X_HANDLE,
    "#定時退社",
  ];

  if (result.reason === "rouki" && result.zangyoPlayerId) {
    lines.splice(3, 0, `（${seatName(seats, result.zangyoPlayerId)}の残業が暴露）`);
  }

  return lines.join("\n");
}

function useCopyFeedback() {
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2200);
  }, []);

  return { feedback, showFeedback };
}

interface MottainaiLinksProps {
  className?: string;
}

export function MottainaiLinks({ className = "" }: MottainaiLinksProps) {
  return (
    <nav className={`mottainai-links ${className}`.trim()} aria-label="MottainaiGames のリンク">
      <a href={MOTTAINAI_HP_URL} target="_blank" rel="noopener noreferrer">
        MottainaiGames 公式HP
      </a>
      <span className="mottainai-links__sep" aria-hidden="true">
        ·
      </span>
      <a href={MOTTAINAI_X_URL} target="_blank" rel="noopener noreferrer">
        X @MottainaiGames
      </a>
    </nav>
  );
}

interface RoomInviteShareProps {
  roomCode: string;
}

export function RoomInviteShare({ roomCode }: RoomInviteShareProps) {
  const { feedback, showFeedback } = useCopyFeedback();
  const code = roomCode.toUpperCase();
  const inviteUrl = buildInviteUrl(code);

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(code);
    showFeedback(ok ? "ルームコードをコピーしました" : "コピーに失敗しました");
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(inviteUrl);
    showFeedback(ok ? "招待リンクをコピーしました" : "コピーに失敗しました");
  };

  const handleTweetInvite = () => {
    openXShare(buildInviteTweet(code));
  };

  return (
    <div className="room-invite room-invite--compact">
      <p className="room-code">{code}</p>
      {feedback && (
        <p className="room-invite__feedback" role="status">
          {feedback}
        </p>
      )}
      <div className="room-invite__actions room-invite__actions--row">
        <button
          type="button"
          className="secondary"
          onClick={handleCopyCode}
          title="ルームコードをコピー"
        >
          コード
        </button>
        <button
          type="button"
          className="secondary"
          onClick={handleCopyLink}
          title="招待リンクをコピー"
        >
          リンク
        </button>
        <button
          type="button"
          className="share-x-btn share-x-btn--compact"
          onClick={handleTweetInvite}
          title="Xでルーム招待をポスト"
        >
          Xで招待
        </button>
      </div>
    </div>
  );
}

export function HomePromoShareButton() {
  return (
    <button
      type="button"
      className="share-x-btn share-x-btn--block"
      onClick={() => openXShare(buildHomePromoTweet())}
    >
      Xで定時退社Webを告知
    </button>
  );
}

interface GameResultShareButtonProps {
  playerId: string;
  playerName: string;
  result: GameResult;
  seats: SeatPublic[];
  roomCode: string;
}

export function GameResultShareButton({
  playerId,
  playerName,
  result,
  seats,
  roomCode,
}: GameResultShareButtonProps) {
  return (
    <button
      type="button"
      className="share-x-btn share-x-btn--block"
      onClick={() =>
        openXShare(
          buildGameResultTweet({
            playerId,
            playerName,
            result,
            seats,
            roomCode,
          }),
        )
      }
    >
      Xで結果をポスト
    </button>
  );
}
