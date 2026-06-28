const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface PlayerDisplayStyle {
  nameplateBg?: string | null;
  nameColor?: string | null;
}

export function normalizePlayerColor(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return null;
  return trimmed;
}

export function normalizePlayerDisplayStyle(
  style: PlayerDisplayStyle,
): { nameplateBg: string | null; nameColor: string | null } | null {
  const nameplateBg = normalizePlayerColor(style.nameplateBg);
  const nameColor = normalizePlayerColor(style.nameColor);
  if (style.nameplateBg && nameplateBg === null) return null;
  if (style.nameColor && nameColor === null) return null;
  return { nameplateBg, nameColor };
}
