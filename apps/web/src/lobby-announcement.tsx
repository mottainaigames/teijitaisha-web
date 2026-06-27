import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPublic } from "@teijitaisha/shared";

interface Announcement {
  id: number;
  text: string;
}

interface Props {
  room: RoomPublic;
  playerId: string;
  enabled: boolean;
}

function playerJoinText(name: string, isObserver?: boolean, isCpu?: boolean): string {
  if (isCpu) return `${name}が追加されました`;
  if (isObserver) return `${name}さんがオブザーバーとして入室しました`;
  return `${name}さんが入室しました`;
}

export function useLobbyAnnouncements({ room, playerId, enabled }: Props) {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const nextIdRef = useRef(0);
  const [items, setItems] = useState<Announcement[]>([]);

  const push = useCallback((text: string) => {
    const id = nextIdRef.current++;
    setItems((prev) => [...prev.slice(-4), { id, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    if (!enabled) {
      knownIdsRef.current = new Set(room.players.map((p) => p.id));
      return;
    }

    const prev = knownIdsRef.current;
    const currentIds = new Set(room.players.map((p) => p.id));

    if (prev.size === 0) {
      const me = room.players.find((p) => p.id === playerId);
      if (me) {
        push(
          me.isObserver
            ? "オブザーバーとしてルームに参加しました"
            : "ルームに参加しました",
        );
      }
    } else {
      for (const p of room.players) {
        if (!prev.has(p.id)) {
          push(playerJoinText(p.name, p.isObserver, p.isCpu));
        }
      }
    }

    knownIdsRef.current = currentIds;
  }, [enabled, playerId, push, room.players]);

  return items;
}

export function LobbyAnnouncementStack({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;

  return (
    <div className="lobby-announcements" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <p key={item.id} className="lobby-announcements__item">
          {item.text}
        </p>
      ))}
    </div>
  );
}
