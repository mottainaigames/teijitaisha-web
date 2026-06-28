import type { ReactNode } from "react";

export interface NamedSeat {
  name: string;
  nameColor?: string;
}

export function seatNameStyle(seat: {
  nameplateBg?: string;
  nameColor?: string;
}): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (seat.nameplateBg) style.background = seat.nameplateBg;
  if (seat.nameColor) style.color = seat.nameColor;
  return Object.keys(style).length > 0 ? style : undefined;
}

export function formatLogMessage(message: string, seats: NamedSeat[]): ReactNode[] {
  const entries = seats
    .filter((s) => s.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  if (entries.length === 0) return [message];

  const parts: ReactNode[] = [];
  let rest = message;
  let key = 0;

  while (rest.length > 0) {
    let best: { index: number; name: string; color?: string } | null = null;
    for (const seat of entries) {
      const index = rest.indexOf(seat.name);
      if (index === -1) continue;
      if (
        !best ||
        index < best.index ||
        (index === best.index && seat.name.length > best.name.length)
      ) {
        best = { index, name: seat.name, color: seat.nameColor };
      }
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    if (best.index > 0) parts.push(rest.slice(0, best.index));
    parts.push(
      <span
        key={key++}
        className="log-player-name"
        style={best.color ? { color: best.color } : undefined}
      >
        {best.name}
      </span>,
    );
    rest = rest.slice(best.index + best.name.length);
  }

  return parts;
}
