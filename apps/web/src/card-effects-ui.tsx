import { useEffect, useState } from "react";
import {
  CARD_EFFECTS,
  CARD_LABELS,
  CARD_TYPES,
  type CardType,
} from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

export function CardEffectText({ cardType }: { cardType: CardType }) {
  return (
    <p className="card-effect-text">
      <strong>{CARD_LABELS[cardType]}</strong>
      <span>{CARD_EFFECTS[cardType]}</span>
    </p>
  );
}

export function CardEffectsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="card-effects-modal" role="dialog" aria-modal="true" aria-label="カード効果一覧">
      <button
        type="button"
        className="card-effects-modal__backdrop"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div className="card-effects-modal__panel">
        <div className="card-effects-modal__header">
          <h2>カード効果一覧</h2>
          <button type="button" className="card-effects-modal__close" onClick={onClose}>
            閉じる
          </button>
        </div>
        <p className="card-effects-modal__note">ペアを場に出したときに発動する効果です</p>
        <ul className="card-effects-list">
          {CARD_TYPES.map((type) => (
            <li key={type} className="card-effects-list__item">
              <PlayingCard cardType={type} size="sm" />
              <div className="card-effects-list__body">
                <strong>{CARD_LABELS[type]}</strong>
                <p>{CARD_EFFECTS[type]}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CardEffectsButton({
  className = "",
  label = "カード効果一覧",
  block = false,
}: {
  className?: string;
  label?: string;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={[
          "secondary",
          "card-effects-btn",
          block ? "card-effects-btn--block" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <CardEffectsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
