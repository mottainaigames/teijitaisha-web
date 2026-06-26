import type { CSSProperties, ReactNode } from "react";
import type { CardType } from "@teijitaisha/shared";
import { CARD_LABELS } from "@teijitaisha/shared";

const CARD_THEMES: Record<CardType, { from: string; to: string; text: string }> = {
  norma: { from: "#dbeafe", to: "#93c5fd", text: "#1e3a8a" },
  rouki: { from: "#fecaca", to: "#f87171", text: "#7f1d1d" },
  nomikai: { from: "#fde68a", to: "#fbbf24", text: "#78350f" },
  shanai_renai: { from: "#fbcfe8", to: "#f472b6", text: "#831843" },
  shinjin_kyouiku: { from: "#bbf7d0", to: "#4ade80", text: "#14532d" },
  jouhou_kyouyu: { from: "#c7d2fe", to: "#818cf8", text: "#312e81" },
  torihiki: { from: "#fed7aa", to: "#fb923c", text: "#7c2d12" },
  enadori: { from: "#a5f3fc", to: "#22d3ee", text: "#164e63" },
  kaigi: { from: "#e9d5ff", to: "#c084fc", text: "#581c87" },
  pawahara: { from: "#d1d5db", to: "#6b7280", text: "#1f2937" },
  tabako_kyuukei: { from: "#e5e7eb", to: "#9ca3af", text: "#374151" },
  zangyo: { from: "#1e293b", to: "#0f172a", text: "#f8fafc" },
};

export function fanTransform(index: number, total: number): CSSProperties {
  if (total <= 1) {
    return {
      ["--fan-rotate" as string]: "0deg",
      ["--fan-lift" as string]: "0px",
    };
  }
  const center = (total - 1) / 2;
  const offset = index - center;
  const rotate = offset * 6;
  const lift = Math.abs(offset) * 3;
  return {
    ["--fan-rotate" as string]: `${rotate}deg`,
    ["--fan-lift" as string]: `${lift}px`,
    transform: "rotate(var(--fan-rotate)) translateY(var(--fan-lift))",
    zIndex: index,
  };
}

interface PlayingCardProps {
  label?: string;
  faceDown?: boolean;
  cardType?: CardType;
  selected?: boolean;
  selectable?: boolean;
  confirmReady?: boolean;
  index?: number;
  total?: number;
  size?: "sm" | "md" | "lg";
  remoteHover?: boolean;
  remoteSelected?: boolean;
  removing?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onClick?: () => void;
}

export function PlayingCard({
  label,
  faceDown = false,
  cardType,
  selected = false,
  selectable = false,
  confirmReady = false,
  remoteHover = false,
  remoteSelected = false,
  removing = false,
  index = 0,
  total = 1,
  size = "md",
  onHoverStart,
  onHoverEnd,
  onClick,
}: PlayingCardProps) {
  const theme = cardType ? CARD_THEMES[cardType] : null;
  const displayLabel = label ?? (cardType ? CARD_LABELS[cardType] : "?");
  const fan = fanTransform(index, total);

  const className = [
    "playing-card",
    `playing-card--${size}`,
    faceDown ? "playing-card--back" : "playing-card--face",
    selectable ? "playing-card--selectable" : "",
    selected ? "playing-card--selected" : "",
    confirmReady ? "playing-card--confirm-ready" : "",
    remoteHover ? "playing-card--remote-hover" : "",
    remoteSelected ? "playing-card--remote-selected" : "",
    removing ? "playing-card--pulling-away" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {
    ...fan,
    ...(theme && !faceDown
      ? {
          background: `linear-gradient(145deg, ${theme.from} 0%, ${theme.to} 100%)`,
          color: theme.text,
        }
      : {}),
  };

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={className}
      style={style}
      onClick={onClick}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      aria-label={faceDown ? "裏向きのカード" : displayLabel}
    >
      {faceDown ? (
        <>
          <span className="playing-card__pattern" aria-hidden />
          <span className="playing-card__back-mark">?</span>
        </>
      ) : (
        <>
          <span className="playing-card__corner playing-card__corner--tl">{displayLabel}</span>
          <span className="playing-card__center">{displayLabel}</span>
          <span className="playing-card__corner playing-card__corner--br">{displayLabel}</span>
        </>
      )}
      {selectable && (
        <span className="playing-card__hand" aria-hidden>
          ✋
        </span>
      )}
      {(remoteHover || remoteSelected) && (
        <span className="playing-card__remote-hand" aria-hidden>
          👆
        </span>
      )}
      {confirmReady && (
        <span className="playing-card__confirm-hint" aria-hidden>
          もう一度
        </span>
      )}
    </Tag>
  );
}

interface CardFanProps {
  children: ReactNode;
  className?: string;
}

export function CardFan({ children, className = "" }: CardFanProps) {
  return <div className={`card-fan ${className}`.trim()}>{children}</div>;
}

/** ペア出し用: 同種カードをまとめて1枚のように見せる */
export function PairCard({
  cardType,
  selected,
  selectable,
  onClick,
}: {
  cardType: CardType;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
}) {
  const theme = CARD_THEMES[cardType];
  const label = CARD_LABELS[cardType];

  return (
    <button
      type="button"
      className={[
        "pair-card",
        selectable ? "playing-card--selectable" : "",
        selected ? "playing-card--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: `linear-gradient(145deg, ${theme.from} 0%, ${theme.to} 100%)`,
        color: theme.text,
      }}
      onClick={onClick}
    >
      <div className="pair-card__stack">
        <span className="pair-card__layer pair-card__layer--back" />
        <span className="pair-card__layer pair-card__layer--front">{label}</span>
      </div>
      <span className="pair-card__badge">×2</span>
      {selectable && (
        <span className="playing-card__hand" aria-hidden>
          ✋
        </span>
      )}
    </button>
  );
}
