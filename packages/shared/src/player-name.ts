export const MAX_PLAYER_NAME_LENGTH = 20;
export const DEFAULT_PLAYER_NAME = "社員";
export const CPU_NAME_SUFFIX = "（CPU）";

/** 改行除去・トリム・最大文字数でクリップ（表示名のサーバー/クライアント共通） */
export function normalizePlayerName(raw: string): string {
  const collapsed = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) return DEFAULT_PLAYER_NAME;
  return [...collapsed].slice(0, MAX_PLAYER_NAME_LENGTH).join("");
}

export function stripCpuNameSuffix(name: string): string {
  return name.replace(/（CPU）$/, "").replace(/\(CPU\)$/i, "").trim();
}

export function formatCpuPlayerName(raw: string): string {
  const base = normalizePlayerName(stripCpuNameSuffix(raw));
  const maxBaseLen = Math.max(1, MAX_PLAYER_NAME_LENGTH - CPU_NAME_SUFFIX.length);
  const clipped = [...base].slice(0, maxBaseLen).join("");
  return `${clipped}${CPU_NAME_SUFFIX}`;
}

export function resolveLobbyPlayerName(raw: string, isCpu: boolean): string {
  return isCpu ? formatCpuPlayerName(raw) : normalizePlayerName(raw);
}

export function maxEditableNameLength(isCpu: boolean): number {
  return isCpu ? Math.max(1, MAX_PLAYER_NAME_LENGTH - CPU_NAME_SUFFIX.length) : MAX_PLAYER_NAME_LENGTH;
}
