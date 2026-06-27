export const MAX_PLAYER_NAME_LENGTH = 20;
export const DEFAULT_PLAYER_NAME = "社員";

/** 改行除去・トリム・最大文字数でクリップ（表示名のサーバー/クライアント共通） */
export function normalizePlayerName(raw: string): string {
  const collapsed = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) return DEFAULT_PLAYER_NAME;
  return [...collapsed].slice(0, MAX_PLAYER_NAME_LENGTH).join("");
}
