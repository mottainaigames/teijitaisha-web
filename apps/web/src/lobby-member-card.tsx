import type { PlayerPublic } from "@teijitaisha/shared";
import { seatNameStyle } from "./player-name-display";

interface Props {
  player: PlayerPublic;
  variant: "player" | "observer";
  isMe: boolean;
  isRoomHost: boolean;
  canManage: boolean;
  postGame?: boolean;
  onKick: (playerId: string) => void;
}

export function LobbyMemberCard({
  player,
  variant,
  isMe,
  isRoomHost,
  canManage,
  postGame = false,
  onKick,
}: Props) {
  const showManage = canManage && !isMe && !player.isCpu;

  const handleKick = () => {
    const label = player.isCpu ? player.name : `${player.name}さん`;
    if (!window.confirm(`${label}をルームから追い出しますか？`)) return;
    onKick(player.id);
  };

  const nameStyle = seatNameStyle(player);

  return (
    <li
      className={[
        "lobby-player-card",
        variant === "observer" ? "lobby-player-card--observer" : "",
        isMe ? "lobby-player-card--me" : "",
        isRoomHost ? "lobby-player-card--host" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {variant === "player" && (
        <span className="lobby-player-card__seat">{player.seatIndex + 1}</span>
      )}

      <span className="lobby-player-card__name" style={nameStyle}>
        {player.name}
      </span>
      <span className="lobby-player-card__tags">
        {isRoomHost && <span className="lobby-player-card__tag">ホスト</span>}
        {player.isCpu && <span className="lobby-player-card__tag">CPU</span>}
        {variant === "observer" && <span className="lobby-player-card__tag">観戦</span>}
        {isMe && <span className="lobby-player-card__tag">あなた</span>}
        {postGame && !player.isCpu && !player.isObserver && (
          <span
            className={[
              "lobby-player-card__tag",
              player.inLobby
                ? "lobby-player-card__tag--in-lobby"
                : "lobby-player-card__tag--results",
            ].join(" ")}
          >
            {player.inLobby ? "ロビー" : "結果確認中"}
          </span>
        )}
      </span>
      {showManage && (
        <div className="lobby-player-card__manage">
          <button
            type="button"
            className="lobby-player-card__action lobby-player-card__action--kick"
            onClick={handleKick}
          >
            追い出す
          </button>
        </div>
      )}
    </li>
  );
}
