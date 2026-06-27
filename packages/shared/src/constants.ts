export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 48;
/** ルール上の推奨人数（この範囲外はバランスが崩れる可能性あり） */
export const RECOMMENDED_MIN_PLAYERS = 3;
export const RECOMMENDED_MAX_PLAYERS = 6;

export function isRecommendedPlayerCount(count: number): boolean {
  return count >= RECOMMENDED_MIN_PLAYERS && count <= RECOMMENDED_MAX_PLAYERS;
}
export const ROOM_CODE_LENGTH = 6;
export const IDLE_TIMEOUT_MS = 20_000;
/** 社内恋愛: 互いの手札を見せ合う時間 */
export const SHANAI_RENAI_VIEW_MS = 10_000;

/** ルームを自動解散するまでの時間（10分）— ロビー未開始・接続なし共通 */
export const ROOM_IDLE_TTL_MS = 10 * 60 * 1000;

/** CPU 行動表示の待ち時間（ミリ秒） */
export const CPU_THINK_MS = 1_000;
export const CPU_ACT_MS = 600;
export const CPU_EFFECT_MS = 800;
export const CPU_QUICK_MS = 400;

/** CPU表示速度（2x = 従来の速さ） */
export type CpuSpeed = "4x" | "2x" | "1x" | "0.5x" | "click";

export const CPU_SPEED_ORDER: CpuSpeed[] = ["4x", "2x", "1x", "0.5x", "click"];

/** 2x を基準（1.0）とした待ち時間の倍率 */
export const CPU_SPEED_MULTIPLIERS: Record<CpuSpeed, number> = {
  "4x": 0.5,
  "2x": 1,
  "1x": 2,
  "0.5x": 4,
  click: 0,
};

export const CPU_SPEED_LABELS: Record<CpuSpeed, string> = {
  "4x": "4倍速",
  "2x": "2倍速",
  "1x": "1倍速",
  "0.5x": "0.5倍速",
  click: "クリック送り",
};

/** ルームコード生成用（紛らわしい文字を除外） */
export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
