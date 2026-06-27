import type { CSSProperties, ReactNode } from "react";
import type { CardType } from "@teijitaisha/shared";
import { CARD_LABELS } from "@teijitaisha/shared";
import { CARD_BACK_URL, CARD_ICON_URLS, CARD_THEMES, type CardTheme } from "./card-assets";

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

function cardThemeVars(theme: CardTheme): CSSProperties {
  return {
    ["--card-band" as string]: theme.band,
    ["--card-accent" as string]: theme.accent,
    ["--card-body" as string]: theme.body,
    ["--card-title" as string]: theme.title,
  };
}

function CardFaceContent({
  cardType,
  label,
  size,
}: {
  cardType: CardType;
  label: string;
  size: "sm" | "md" | "lg";
}) {
  const iconUrl = CARD_ICON_URLS[cardType];

  return (
    <div className={`playing-card__inner playing-card__inner--${size}`}>
      <div className="playing-card__band">
        <span className="playing-card__band-accent" aria-hidden />
        <span className="playing-card__name">{label}</span>
      </div>
      <div className="playing-card__body">
        <div className="playing-card__icon-ring">
          <img className="playing-card__icon" src={iconUrl} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
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
  inspected?: boolean;
  reorderable?: boolean;
  dragCardId?: string;
  onReorderDrop?: (draggedCardId: string, targetCardId: string) => void;
  muted?: boolean;
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
  inspected = false,
  reorderable = false,
  dragCardId,
  onReorderDrop,
  muted = false,
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
    cardType ? `playing-card--type-${cardType}` : "",
    selectable ? "playing-card--selectable" : "",
    selected ? "playing-card--selected" : "",
    confirmReady ? "playing-card--confirm-ready" : "",
    remoteHover ? "playing-card--remote-hover" : "",
    remoteSelected ? "playing-card--remote-selected" : "",
    removing ? "playing-card--pulling-away" : "",
    inspected ? "playing-card--inspected" : "",
    reorderable ? "playing-card--reorderable" : "",
    muted ? "playing-card--muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {
    ...fan,
    ...(theme && !faceDown ? cardThemeVars(theme) : {}),
  };

  const Tag = onClick && !reorderable ? "button" : "div";

  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      className={className}
      style={style}
      draggable={reorderable}
      onClick={onClick}
      onDragStart={(e) => {
        if (!reorderable || !dragCardId) return;
        e.dataTransfer.setData("text/plain", dragCardId);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!reorderable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (!reorderable || !dragCardId || !onReorderDrop) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== dragCardId) {
          onReorderDrop(draggedId, dragCardId);
        }
      }}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      aria-label={faceDown ? "裏向きのカード" : displayLabel}
    >
      {faceDown ? (
        <img className="playing-card__back-img" src={CARD_BACK_URL} alt="" draggable={false} />
      ) : cardType ? (
        <CardFaceContent cardType={cardType} label={displayLabel} size={size} />
      ) : (
        <div className="playing-card__unknown">{displayLabel}</div>
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
        `playing-card--type-${cardType}`,
        selectable ? "playing-card--selectable" : "",
        selected ? "playing-card--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={cardThemeVars(theme)}
      onClick={onClick}
    >
      <div className="pair-card__stack">
        <span className="pair-card__layer pair-card__layer--back" />
        <span className="pair-card__layer pair-card__layer--front">
          <CardFaceContent cardType={cardType} label={label} size="md" />
        </span>
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
