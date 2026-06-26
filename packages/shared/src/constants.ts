export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 6;
export const IDLE_TIMEOUT_MS = 20_000;

/** 人が接続していないルームを掃除するまでの時間（24時間） */
export const ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

/** CPU 行動表示の待ち時間（ミリ秒） */
export const CPU_THINK_MS = 1_000;
export const CPU_ACT_MS = 600;
export const CPU_EFFECT_MS = 800;
export const CPU_QUICK_MS = 400;

/** ルームコード生成用（紛らわしい文字を除外） */
export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
