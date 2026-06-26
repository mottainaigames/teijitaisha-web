import { useEffect, useState } from "react";
import { CARD_LABELS, type RoukiReveal } from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

export function RoukiRevealOverlay({ reveal }: { reveal: RoukiReveal | null }) {
  const [active, setActive] = useState<RoukiReveal | null>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    setActive(reveal);
    setFlipped(false);
    const flipTimer = window.setTimeout(() => setFlipped(true), 400);
    const hideTimer = window.setTimeout(() => setActive(null), 2800);
    return () => {
      window.clearTimeout(flipTimer);
      window.clearTimeout(hideTimer);
    };
  }, [reveal?.at]);

  if (!active) return null;

  return (
    <div className="rouki-reveal" role="status" aria-live="polite">
      <div className="rouki-reveal__backdrop" />
      <div className="rouki-reveal__content">
        <p className="rouki-reveal__title">労基摘発 — カード公開</p>
        <p className="rouki-reveal__meta">
          {active.actorName}が{active.ownerName}の手札から選んだカード
        </p>
        <div className={`rouki-reveal__flip ${flipped ? "rouki-reveal__flip--done" : ""}`}>
          <div className="rouki-reveal__flip-inner">
            <div className="rouki-reveal__face rouki-reveal__face--back">
              <PlayingCard faceDown size="lg" />
            </div>
            <div className="rouki-reveal__face rouki-reveal__face--front">
              <PlayingCard cardType={active.cardType} size="lg" />
            </div>
          </div>
        </div>
        {flipped && (
          <p className="rouki-reveal__result">
            <strong>{CARD_LABELS[active.cardType]}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
