import { useState, type FormEvent } from "react";
import {
  CPU_NAME_SUFFIX,
  maxEditableNameLength,
  stripCpuNameSuffix,
  type PlayerPublic,
} from "@teijitaisha/shared";

interface Props {
  player: PlayerPublic;
  variant: "player" | "observer";
  isMe: boolean;
  isRoomHost: boolean;
  canManage: boolean;
  onRename: (playerId: string, name: string) => void;
  onKick: (playerId: string) => void;
}

export function LobbyMemberCard({
  player,
  variant,
  isMe,
  isRoomHost,
  canManage,
  onRename,
  onKick,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(() =>
    player.isCpu ? stripCpuNameSuffix(player.name) : player.name,
  );

  const showManage = canManage && !isMe;
  const maxLength = maxEditableNameLength(Boolean(player.isCpu));

  const startEdit = () => {
    setDraftName(player.isCpu ? stripCpuNameSuffix(player.name) : player.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftName(player.isCpu ? stripCpuNameSuffix(player.name) : player.name);
    setEditing(false);
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onRename(player.id, trimmed);
    setEditing(false);
  };

  const handleKick = () => {
    const label = player.isCpu ? player.name : `${player.name}さん`;
    if (!window.confirm(`${label}をルームから追い出しますか？`)) return;
    onKick(player.id);
  };

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

      {editing ? (
        <form className="lobby-player-card__rename" onSubmit={submitRename}>
          <input
            className="lobby-player-card__rename-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={maxLength}
            autoFocus
            aria-label={`${player.name}の新しい名前`}
          />
          {player.isCpu && (
            <p className="lobby-player-card__rename-hint">保存時に{CPU_NAME_SUFFIX}が付きます</p>
          )}
          <div className="lobby-player-card__rename-actions">
            <button type="submit" className="lobby-player-card__action">
              保存
            </button>
            <button type="button" className="lobby-player-card__action secondary" onClick={cancelEdit}>
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          <span className="lobby-player-card__name">{player.name}</span>
          <span className="lobby-player-card__tags">
            {isRoomHost && <span className="lobby-player-card__tag">ホスト</span>}
            {player.isCpu && <span className="lobby-player-card__tag">CPU</span>}
            {variant === "observer" && <span className="lobby-player-card__tag">観戦</span>}
            {isMe && <span className="lobby-player-card__tag">あなた</span>}
          </span>
          {showManage && (
            <div className="lobby-player-card__manage">
              <button type="button" className="lobby-player-card__action secondary" onClick={startEdit}>
                名前
              </button>
              <button type="button" className="lobby-player-card__action lobby-player-card__action--kick" onClick={handleKick}>
                追い出す
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
