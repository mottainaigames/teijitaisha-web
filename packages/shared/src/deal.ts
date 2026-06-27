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

/** 手札枚数に差があるか（49枚 ÷ 人数 の余りがある場合など） */
export function hasUnequalHandSizes(
  playerIds: PlayerId[],
  hands: Record<PlayerId, CardInstance[]>,
): boolean {
  if (playerIds.length === 0) return false;
  const sizes = playerIds.map((id) => hands[id]?.length ?? 0);
  return Math.min(...sizes) !== Math.max(...sizes);
}

/**
 * 先攻席を決める: 左隣が手札最多のプレイヤーになる席（最初の引きが最多手札から）。
 */
export function firstSeatDrawingFromMaxHand(
  playerIds: PlayerId[],
  hands: Record<PlayerId, CardInstance[]>,
  random: () => number,
): number {
  const maxCount = Math.max(...playerIds.map((id) => hands[id]?.length ?? 0));
  const maxIds = playerIds.filter((id) => (hands[id]?.length ?? 0) === maxCount);
  const sourceId = maxIds[Math.floor(random() * maxIds.length)]!;
  const sourceSeatIndex = playerIds.indexOf(sourceId);
  return (sourceSeatIndex + 1) % playerIds.length;
}
