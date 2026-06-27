import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { PlayerPublic } from "@teijitaisha/shared";

const DRAG_THRESHOLD_PX = 8;

interface Props {
  players: PlayerPublic[];
  myPlayerId: string;
  editable: boolean;
  onReorder: (playerIds: string[]) => void;
  onShuffle: () => void;
}

function sortedPlayers(players: PlayerPublic[]): PlayerPublic[] {
  return [...players].sort((a, b) => a.seatIndex - b.seatIndex);
}

function applyReorder(ids: string[], dragId: string, insertIndex: number): string[] {
  const next = [...ids];
  const fromIdx = next.indexOf(dragId);
  if (fromIdx === -1) return ids;
  let target = insertIndex;
  if (fromIdx < target) target -= 1;
  next.splice(fromIdx, 1);
  next.splice(target, 0, dragId);
  return next;
}

function computeInsertIndex(clientX: number, slots: { id: string; el: HTMLElement }[], dragId: string): number {
  const others = slots.filter((s) => s.id !== dragId);
  if (others.length === 0) return 0;
  for (let i = 0; i < others.length; i++) {
    const rect = others[i]!.el.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) return i;
  }
  return others.length;
}

export function LobbySeatOrder({ players, myPlayerId, editable, onReorder, onShuffle }: Props) {
  const sorted = sortedPlayers(players);
  const seatRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingRef = useRef<{ id: string; pointerId: number; startX: number; startY: number } | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const insertIndexRef = useRef(0);
  const idsRef = useRef(sorted.map((p) => p.id));
  const onReorderRef = useRef(onReorder);

  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  useEffect(() => {
    idsRef.current = sorted.map((p) => p.id);
  }, [sorted]);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  const finishDrag = useCallback((clientX: number) => {
    const dragState = dragRef.current;
    if (!dragState) return;
    const slots = [...seatRefs.current.entries()].map(([id, el]) => ({ id, el }));
    const nextIndex = computeInsertIndex(clientX, slots, dragState.id);
    const nextIds = applyReorder(idsRef.current, dragState.id, nextIndex);
    if (nextIds.join(",") !== idsRef.current.join(",")) {
      onReorderRef.current(nextIds);
    }
    dragRef.current = null;
    pendingRef.current = null;
    setDrag(null);
    setInsertIndex(null);
  }, []);

  useEffect(() => {
    if (!drag) return;
    document.body.classList.add("lobby-seat-order-dragging");
    window.getSelection()?.removeAllRanges();
    const blockSelect = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", blockSelect);
    return () => {
      document.body.classList.remove("lobby-seat-order-dragging");
      document.removeEventListener("selectstart", blockSelect);
    };
  }, [drag]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: globalThis.PointerEvent) => {
      if (dragRef.current) {
        dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY };
        setDrag({ ...dragRef.current });
        const slots = [...seatRefs.current.entries()].map(([id, el]) => ({ id, el }));
        const idx = computeInsertIndex(e.clientX, slots, dragRef.current.id);
        insertIndexRef.current = idx;
        setInsertIndex(idx);
      }
    };
    const onUp = (e: globalThis.PointerEvent) => {
      finishDrag(e.clientX);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, finishDrag]);

  const onPointerDown = (playerId: string) => (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pendingRef.current = {
      id: playerId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const onPointerMove = (playerId: string) => (e: PointerEvent<HTMLDivElement>) => {
    const pending = pendingRef.current;
    if (!pending || pending.id !== playerId || pending.pointerId !== e.pointerId) return;
    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    dragRef.current = { id: playerId, x: e.clientX, y: e.clientY };
    setDrag({ ...dragRef.current });
  };

  const onPointerUp = (playerId: string) => (e: PointerEvent<HTMLDivElement>) => {
    const pending = pendingRef.current;
    if (pending?.id === playerId && !dragRef.current) {
      pendingRef.current = null;
      return;
    }
    if (dragRef.current?.id === playerId) {
      finishDrag(e.clientX);
    }
  };

  if (sorted.length === 0) return null;

  const displayIds =
    drag && insertIndex !== null
      ? applyReorder(
          sorted.map((p) => p.id),
          drag.id,
          insertIndex,
        )
      : sorted.map((p) => p.id);
  const displayPlayers = displayIds
    .map((id) => sorted.find((p) => p.id === id))
    .filter((p): p is PlayerPublic => Boolean(p));

  return (
    <div className={`lobby-seat-order${editable ? " lobby-seat-order--editable" : ""}`}>
      <div className="lobby-seat-order__head">
        <p className="lobby-seat-order__title">プレイ順（左隣から引く）</p>
        {editable && (
          <button type="button" className="lobby-seat-order__shuffle secondary" onClick={onShuffle}>
            ランダム
          </button>
        )}
      </div>
      {editable && (
        <p className="lobby-seat-order__hint">ドラッグで順番を入れ替えできます（ホストのみ）</p>
      )}
      <div className="lobby-seat-order__track">
        {displayPlayers.map((player, i) => {
          const isMe = player.id === myPlayerId;
          const isDragging = drag?.id === player.id;
          return (
            <Fragment key={player.id}>
              {i > 0 && <span className="lobby-seat-order__arrow" aria-hidden>→</span>}
              <div
                ref={(el) => {
                  if (el) seatRefs.current.set(player.id, el);
                  else seatRefs.current.delete(player.id);
                }}
                className={[
                  "lobby-seat-order__seat",
                  isMe ? "lobby-seat-order__seat--me" : "",
                  isDragging ? "lobby-seat-order__seat--dragging" : "",
                  editable ? "lobby-seat-order__seat--editable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={onPointerDown(player.id)}
                onPointerMove={onPointerMove(player.id)}
                onPointerUp={onPointerUp(player.id)}
                onDragStart={(e) => e.preventDefault()}
                style={
                  isDragging
                    ? {
                        position: "fixed",
                        left: drag!.x,
                        top: drag!.y,
                        transform: "translate(-50%, -50%)",
                        zIndex: 50,
                        pointerEvents: "none",
                      }
                    : undefined
                }
              >
                <span className="lobby-seat-order__index">{i + 1}</span>
                <span className="lobby-seat-order__name">{player.name}</span>
                {player.isCpu && <span className="lobby-seat-order__badge">CPU</span>}
                {isMe && <span className="lobby-seat-order__badge">あなた</span>}
              </div>
            </Fragment>
          );
        })}
        {sorted.length > 1 && (
          <span className="lobby-seat-order__wrap" aria-label="順番は一周する">
            ↺
          </span>
        )}
      </div>
    </div>
  );
}
