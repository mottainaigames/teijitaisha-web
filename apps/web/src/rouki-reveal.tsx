import { useEffect, useState } from "react";
import { CARD_LABELS, ROUKI_ZANGYO_FINALE_MS, type RoukiReveal } from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

type Stage = "enter" | "flip" | "revealed" | "expose" | "ending";

const FLIP_DELAY_MS = 400;
const FLIP_DURATION_MS = 700;
const REVEAL_HOLD_MS = 900;
const EXPOSE_DELAY_MS = FLIP_DELAY_MS + FLIP_DURATION_MS + REVEAL_HOLD_MS;

export function RoukiRevealOverlay({
  reveal,
  isZangyoFinale = false,
}: {
  reveal: RoukiReveal | null;
  isZangyoFinale?: boolean;
}) {
  const [active, setActive] = useState<RoukiReveal | null>(null);
  const [stage, setStage] = useState<Stage>("enter");

  const isZangyo = isZangyoFinale || active?.cardType === "zangyo";

  useEffect(() => {
    if (!reveal) return;

    setActive(reveal);
    setStage("enter");

    const flipTimer = window.setTimeout(() => setStage("flip"), FLIP_DELAY_MS);
    const revealedTimer = window.setTimeout(
      () => setStage("revealed"),
      FLIP_DELAY_MS + FLIP_DURATION_MS,
    );
    const exposeTimer = isZangyoFinale
      ? window.setTimeout(() => setStage("expose"), EXPOSE_DELAY_MS)
      : undefined;
    const endingTimer = isZangyoFinale
      ? window.setTimeout(
          () => setStage("ending"),
          EXPOSE_DELAY_MS + Math.max(0, ROUKI_ZANGYO_FINALE_MS - EXPOSE_DELAY_MS - 900),
        )
      : undefined;
    const hideTimer = !isZangyoFinale
      ? window.setTimeout(() => setActive(null), 2800)
      : undefined;

    return () => {
      window.clearTimeout(flipTimer);
      window.clearTimeout(revealedTimer);
      if (exposeTimer) window.clearTimeout(exposeTimer);
      if (endingTimer) window.clearTimeout(endingTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [reveal?.at, isZangyoFinale]);

  if (!active) return null;

  const flipped = stage !== "enter";
  const showResult = stage === "revealed" || stage === "expose" || stage === "ending";

  return (
    <div
      className={[
        "rouki-reveal",
        isZangyo ? "rouki-reveal--zangyo" : "",
        stage === "expose" ? "rouki-reveal--expose" : "",
        stage === "ending" ? "rouki-reveal--ending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="rouki-reveal__backdrop" />
      <div className="rouki-reveal__content">
        <p className="rouki-reveal__title">
          {isZangyo && stage === "expose"
            ? "残業が暴露！"
            : isZangyo && stage === "ending"
              ? "ゲーム終了"
              : "労基摘発 — カード公開"}
        </p>
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
        {showResult && (
          <p className="rouki-reveal__result">
            <strong>{CARD_LABELS[active.cardType]}</strong>
          </p>
        )}
        {isZangyo && stage === "expose" && (
          <p className="rouki-reveal__zangyo-callout">
            {active.ownerName}の負け…
          </p>
        )}
        {isZangyo && stage === "ending" && (
          <p className="rouki-reveal__ending-hint">結果を表示しています…</p>
        )}
      </div>
    </div>
  );
}
