import type { CardType } from "./cards.js";
import { NON_PAIRABLE } from "./cards.js";
import type { CardInstance } from "./game.js";

/** ペアとして出せるカード種別（2枚以上） */
export function getPairableTypes(hand: CardInstance[]): CardType[] {
  const counts = new Map<CardType, number>();
  for (const card of hand) {
    if (NON_PAIRABLE.has(card.type)) continue;
    counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([t]) => t);
}

export function removeCardsByType(hand: CardInstance[], type: CardType, count = 2): CardInstance[] {
  const removed: CardInstance[] = [];
  const rest: CardInstance[] = [];
  for (const card of hand) {
    if (removed.length < count && card.type === type) {
      removed.push(card);
    } else {
      rest.push(card);
    }
  }
  if (removed.length < count) {
    throw new Error(`Not enough cards of type ${type}`);
  }
  return rest;
}

export function removeCardById(
  hand: CardInstance[],
  cardId: string,
): {
  card: CardInstance;
  hand: CardInstance[];
} {
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error("Card not found");
  const card = hand[idx]!;
  return { card, hand: [...hand.slice(0, idx), ...hand.slice(idx + 1)] };
}

export function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}
