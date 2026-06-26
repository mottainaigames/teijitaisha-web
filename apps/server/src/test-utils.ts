/** テスト用: 固定値を順に返す乱数関数 */
export function seqRandom(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

export const THREE_PLAYERS = [
  { id: "p1", name: "1番" },
  { id: "p2", name: "2番" },
  { id: "p3", name: "3番" },
] as const;
