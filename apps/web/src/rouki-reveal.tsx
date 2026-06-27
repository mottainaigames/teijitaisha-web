import { useEffect, useState } from "react";
import { CARD_LABELS, ROUKI_ZANGYO_FINALE_MS, type RoukiReveal } from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

export type RoukiFinaleRole = "winner" | "loser" | "spectator";

type Stage = "enter" | "flip" | "revealed" | "expose" | "ending";

const FLIP_DELAY_MS = 400;
const FLIP_DURATION_MS = 700;
const REVEAL_HOLD_MS = 900;
const EXPOSE_DELAY_MS = FLIP_DELAY_MS + FLIP_DURATION_MS + REVEAL_HOLD_MS;

function titleForStage(
  stage: Stage,
  role: RoukiFinaleRole,
  active: RoukiReveal,
  isZangyoFinale: boolean,
): string {
  if (!isZangyoFinale) return "労基摘発 — カード公開";

  if (stage === "revealed" || stage === "flip") {
    switch (role) {
      case "winner":
        return "残業カードを暴く…";
      case "loser":
        return "カードが選ばれた…";
      default:
        return "労基摘発 — カード公開";
    }
  }

  if (stage === "expose") {
    switch (role) {
      case "winner":
        return "残業を摘発！";
      case "loser":
        return "残業が暴露！";
      default:
        return `${active.ownerName}の残業が暴露！`;
    }
  }
  if (stage === "ending") {
    switch (role) {
      case "winner":
        return "勝利！";
      case "loser":
        return "敗北…";
      default:
        return "ゲーム終了";
    }
  }
  return "労基摘発 — カード公開";
}

function calloutForStage(
  stage: Stage,
  role: RoukiFinaleRole,
  active: RoukiReveal,
): string | null {
  if (stage === "expose") {
    switch (role) {
      case "winner":
        return "労基法により残業カードを摘発しました";
      case "loser":
        return "定時退社できませんでした…";
      default:
        return `${active.actorName}が${active.ownerName}の残業を暴きました`;
    }
  }
  if (stage === "ending") {
    switch (role) {
      case "winner":
        return "おめでとうございます";
      case "loser":
        return `${active.ownerName}の負け`;
      default:
        return "結果画面を確認できます";
    }
  }
  return null;
}

export function RoukiRevealOverlay({
  reveal,
  isZangyoFinale = false,
  role = "spectator",
}: {
  reveal: RoukiReveal | null;
  isZangyoFinale?: boolean;
  role?: RoukiFinaleRole;
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
  const callout = isZangyoFinale ? calloutForStage(stage, role, active) : null;

  return (
    <div
      className={[
        "rouki-reveal",
        isZangyo ? "rouki-reveal--zangyo" : "",
        isZangyoFinale ? `rouki-reveal--role-${role}` : "",
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
          {titleForStage(stage, role, active, isZangyoFinale)}
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
        {callout && <p className="rouki-reveal__zangyo-callout">{callout}</p>}
        {isZangyoFinale && stage === "ending" && (
          <p className="rouki-reveal__ending-hint">まもなく結果画面へ…</p>
        )}
      </div>
    </div>
  );
}

export function getRoukiFinaleRole(
  playerId: string,
  reveal: RoukiReveal | null,
  pending: { type: string; effectUserId?: string | null; targetId?: string } | null,
  result: { reason: string; roukiPlayerId?: string; zangyoPlayerId?: string } | null,
): RoukiFinaleRole {
  const roukiId = reveal?.actorId ?? pending?.effectUserId ?? result?.roukiPlayerId;
  const zangyoId = reveal?.ownerId ?? pending?.targetId ?? result?.zangyoPlayerId;
  if (!roukiId || !zangyoId) return "spectator";
  if (playerId === roukiId) return "winner";
  if (playerId === zangyoId) return "loser";
  return "spectator";
}
