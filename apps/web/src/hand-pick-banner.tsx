import { CARD_LABELS, type GameView } from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

export type HandPickGuideMode = "info_share" | "trade";

interface Props {
  mode: HandPickGuideMode;
  view: GameView;
  playerId: string;
  selectedCardId: string | null;
}

function leftNeighborName(view: GameView, playerId: string): string {
  const sorted = [...view.seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const idx = sorted.findIndex((s) => s.playerId === playerId);
  if (idx === -1) return "?";
  const leftIdx = (idx - 1 + sorted.length) % sorted.length;
  return sorted[leftIdx]?.name ?? "?";
}

function tradePartnerName(view: GameView, playerId: string): string | null {
  if (view.pending?.type !== "trade") return null;
  const partnerId = view.pending.playerIds.find((id) => id !== playerId);
  if (!partnerId) return null;
  return view.seats.find((s) => s.playerId === partnerId)?.name ?? "?";
}

function infoShareProgress(view: GameView): { ready: number; total: number } {
  const readyMap = view.pending?.infoShareReady;
  if (!readyMap) return { ready: 0, total: 0 };
  const entries = Object.values(readyMap);
  return {
    ready: entries.filter(Boolean).length,
    total: entries.length,
  };
}

export function HandPickBanner({ mode, view, playerId, selectedCardId }: Props) {
  const hasSubmitted =
    mode === "info_share"
      ? (view.pending?.infoShareReady?.[playerId] ?? false)
      : (view.pending?.tradeReady?.[playerId] ?? false);

  const selectedCard =
    selectedCardId != null ? view.myHand.find((c) => c.id === selectedCardId) : null;
  const step = hasSubmitted ? 3 : selectedCardId ? 2 : 1;

  if (mode === "info_share") {
    const neighbor = leftNeighborName(view, playerId);
    const { ready, total } = infoShareProgress(view);

    return (
      <div className="hand-pick-banner hand-pick-banner--info_share">
        <div className="hand-pick-banner__head">
          <span className="hand-pick-banner__badge">情報共有</span>
          {total > 0 && (
            <span className="hand-pick-banner__progress">
              選択済み {ready}/{total}人
            </span>
          )}
        </div>

        {hasSubmitted ? (
          <div className="hand-pick-banner__waiting">
            <p className="hand-pick-banner__waiting-title">選択を送信しました</p>
            <p className="hand-pick-banner__waiting-desc">
              全員が選び終わると、左隣へ一斉に渡されます
            </p>
          </div>
        ) : (
          <>
            <p className="hand-pick-banner__flow">
              あなたのカード <span className="hand-pick-banner__arrow">→</span> 左隣の{" "}
              <strong>{neighbor}</strong>
            </p>
            <ol className={`hand-pick-banner__steps hand-pick-banner__steps--step${step}`}>
              <li className={step >= 1 ? "is-active" : ""}>
                <span className="hand-pick-banner__step-num">1</span>
                下の手札から渡すカードを1枚タップ
              </li>
              <li className={step >= 2 ? "is-active" : ""}>
                <span className="hand-pick-banner__step-num">2</span>
                同じカードをもう一度タップで確定
              </li>
            </ol>
            {step === 2 && selectedCard && (
              <div className="hand-pick-banner__preview">
                <PlayingCard cardType={selectedCard.type} size="sm" selected confirmReady />
                <p>
                  <strong>{CARD_LABELS[selectedCard.type]}</strong> を {neighbor} に渡す — もう一度タップ
                </p>
              </div>
            )}
            <p className="hand-pick-banner__pointer" aria-hidden>
              ↓ 手札から選ぶ
            </p>
          </>
        )}
      </div>
    );
  }

  const partner = tradePartnerName(view, playerId);
  const partnerReady =
    view.pending?.type === "trade" && view.pending.tradeReady
      ? Object.entries(view.pending.tradeReady).some(([id, ready]) => id !== playerId && ready)
      : false;

  return (
    <div className="hand-pick-banner hand-pick-banner--trade">
      <div className="hand-pick-banner__head">
        <span className="hand-pick-banner__badge">取引</span>
        {partner && (
          <span className="hand-pick-banner__partner">相手: {partner}</span>
        )}
      </div>

      {hasSubmitted ? (
        <div className="hand-pick-banner__waiting">
          <p className="hand-pick-banner__waiting-title">選択を送信しました</p>
          <p className="hand-pick-banner__waiting-desc">
            {partnerReady
              ? "双方の選択が揃いました — 交換処理中…"
              : `${partner ?? "相手"}の選択を待っています…`}
          </p>
        </div>
      ) : (
        <>
          <p className="hand-pick-banner__flow">
            {partner ? (
              <>
                <strong>{partner}</strong> とカードを1枚ずつ交換します
              </>
            ) : (
              "相手とカードを1枚ずつ交換します"
            )}
          </p>
          <ol className={`hand-pick-banner__steps hand-pick-banner__steps--step${step}`}>
            <li className={step >= 1 ? "is-active" : ""}>
              <span className="hand-pick-banner__step-num">1</span>
              下の手札から渡すカードを1枚タップ
            </li>
            <li className={step >= 2 ? "is-active" : ""}>
              <span className="hand-pick-banner__step-num">2</span>
              同じカードをもう一度タップで確定
            </li>
          </ol>
          {step === 2 && selectedCard && (
            <div className="hand-pick-banner__preview">
              <PlayingCard cardType={selectedCard.type} size="sm" selected confirmReady />
              <p>
                <strong>{CARD_LABELS[selectedCard.type]}</strong> を交換 — もう一度タップ
              </p>
            </div>
          )}
          <p className="hand-pick-banner__pointer" aria-hidden>
            ↓ 手札から選ぶ
          </p>
        </>
      )}
    </div>
  );
}
