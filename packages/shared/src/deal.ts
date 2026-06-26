import type { CardType } from "./cards.js";
import { buildDeck, shuffle } from "./cards.js";
import type { CardInstance } from "./game.js";
import type { PlayerId } from "./types.js";

export function createCardInstances(types: CardType[], idGen: () => string): CardInstance[] {
  return types.map((type) => ({ id: idGen(), type }));
}

export function dealHands(
  playerIds: PlayerId[],
  firstSeatIndex: number,
  random: () => number,
  idGen: () => string,
): { hands: Record<PlayerId, CardInstance[]>; deck: CardInstance[] } {
  const deck = createCardInstances(shuffle(buildDeck(), random), idGen);
  const n = playerIds.length;
  const base = Math.floor(deck.length / n);
  const remainder = deck.length % n;

  const hands: Record<PlayerId, CardInstance[]> = {};
  for (const id of playerIds) hands[id] = [];

  let offset = 0;
  for (let i = 0; i < n; i++) {
    const seatIndex = (firstSeatIndex + i) % n;
    const pid = playerIds[seatIndex]!;
    const extra = i < remainder ? 1 : 0;
    const count = base + extra;
    hands[pid] = deck.slice(offset, offset + count);
    offset += count;
  }

  return { hands, deck: deck.slice(offset) };
}
