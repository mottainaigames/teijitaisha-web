import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { CardType } from "@teijitaisha/shared";
import { CardFan, PlayingCard, fanTransform } from "./cards-ui";

const DRAG_THRESHOLD_PX = 8;

export interface HandCardItem {
  id: string;
  type: CardType;
}

interface DragState {
  cardId: string;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}

interface PendingPointer {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

interface Props {
  cards: HandCardItem[];
  onReorder: (cardIds: string[]) => void;
  onCardTap?: (card: HandCardItem) => void;
  focusedCardId?: string | null;
}

function computeInsertIndex(
  clientX: number,
  slots: { id: string; el: HTMLElement }[],
  dragId: string,
): number {
  const others = slots.filter((s) => s.id !== dragId);
  if (others.length === 0) return 0;

  for (let i = 0; i < others.length; i++) {
    const rect = others[i]!.el.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (clientX < mid) return i;
  }
  return others.length;
}

function applyReorder(cards: HandCardItem[], dragId: string, insertIndex: number): string[] {
  const ids = cards.map((c) => c.id);
  const fromIdx = ids.indexOf(dragId);
  if (fromIdx === -1) return ids;
  let target = insertIndex;
  if (fromIdx < target) target -= 1;
  ids.splice(fromIdx, 1);
  ids.splice(target, 0, dragId);
  return ids;
}

export function ReorderableHandFan({ cards, onReorder, onCardTap, focusedCardId }: Props) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingRef = useRef<PendingPointer | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const insertIndexRef = useRef<number>(0);
  const cardsRef = useRef(cards);
  const onReorderRef = useRef(onReorder);
  const onCardTapRef = useRef(onCardTap);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);
  useEffect(() => {
    onCardTapRef.current = onCardTap;
  }, [onCardTap]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const setInsert = useCallback((index: number) => {
    insertIndexRef.current = index;
    setInsertIndex(index);
  }, []);

  const beginDrag = useCallback(
    (pending: PendingPointer, clientX: number, clientY: number) => {
      const state: DragState = {
        cardId: pending.cardId,
        offsetX: pending.offsetX,
        offsetY: pending.offsetY,
        x: clientX,
        y: clientY,
      };
      dragRef.current = state;
      setDrag(state);
      const slots = [...cardRefs.current.entries()].map(([id, el]) => ({ id, el }));
      const idx = computeInsertIndex(clientX, slots, pending.cardId);
      setInsert(idx);
    },
    [setInsert],
  );

  const finishDrag = useCallback(() => {
    const state = dragRef.current;
    if (state) {
      const next = applyReorder(cardsRef.current, state.cardId, insertIndexRef.current);
      if (next.join(",") !== cardsRef.current.map((c) => c.id).join(",")) {
        onReorderRef.current(next);
      }
    }
    dragRef.current = null;
    pendingRef.current = null;
    setDrag(null);
    setInsertIndex(null);
  }, []);

  const handlePointerDown = useCallback(
    (card: HandCardItem, e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      pendingRef.current = {
        cardId: card.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left - rect.width / 2,
        offsetY: e.clientY - rect.top - rect.height / 2,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const pending = pendingRef.current;
      if (pending && pending.pointerId === e.pointerId && !dragRef.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          beginDrag(pending, e.clientX, e.clientY);
        }
        return;
      }

      const state = dragRef.current;
      if (!state) return;
      const next = { ...state, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);
      const slots = [...cardRefs.current.entries()].map(([id, el]) => ({ id, el }));
      const idx = computeInsertIndex(e.clientX, slots, state.cardId);
      if (idx !== insertIndexRef.current) setInsert(idx);
    },
    [beginDrag, setInsert],
  );

  const handlePointerUp = useCallback(
    (card: HandCardItem, e: PointerEvent<HTMLDivElement>) => {
      if (pendingRef.current?.pointerId !== e.pointerId && !dragRef.current) return;

      if (dragRef.current) {
        finishDrag();
      } else if (pendingRef.current?.cardId === card.id) {
        onCardTapRef.current?.(card);
      }
      pendingRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [finishDrag],
  );

  const handlePointerCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (dragRef.current) finishDrag();
      else pendingRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [finishDrag],
  );

  const totalSlots = cards.length;
  const dragId = drag?.cardId ?? null;
  const activeInsert = dragId !== null && insertIndex !== null ? insertIndex : null;
  const others = dragId ? cards.filter((c) => c.id !== dragId) : cards;
  const draggedCard = dragId ? cards.find((c) => c.id === dragId) : null;

  return (
    <>
      <CardFan className={`card-fan--reorder${drag ? " card-fan--reorder-active" : ""}`}>
        {others.map((card, i) => {
          let visualIndex = i;
          if (activeInsert !== null && i >= activeInsert) {
            visualIndex = i + 1;
          }
          const fan = fanTransform(visualIndex, totalSlots);
          const showGapBefore = activeInsert === i;

          return (
            <div key={card.id} className="reorder-slot">
              {showGapBefore && <div className="reorder-gap" aria-hidden />}
              <div
                ref={(el) => setCardRef(card.id, el)}
                className="reorder-slot__card"
                style={fan}
                onPointerDown={(e) => handlePointerDown(card, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(card, e)}
                onPointerCancel={handlePointerCancel}
              >
                <PlayingCard
                  cardType={card.type}
                  flat
                  reorderable
                  inspected={focusedCardId === card.id}
                />
              </div>
            </div>
          );
        })}
        {activeInsert !== null && activeInsert >= others.length && (
          <div className="reorder-gap reorder-gap--end" aria-hidden />
        )}
      </CardFan>
      {draggedCard && drag && (
        <div
          className="reorder-float"
          style={{
            left: drag.x,
            top: drag.y,
            transform: `translate(calc(-50% + ${drag.offsetX}px), calc(-50% + ${drag.offsetY}px))`,
          }}
        >
          <PlayingCard cardType={draggedCard.type} flat reorderable />
        </div>
      )}
    </>
  );
}
