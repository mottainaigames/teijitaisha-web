import { CARD_LABELS, type CardType, type GameView } from "@teijitaisha/shared";
import { PlayingCard } from "./cards-ui";

export type HandPickMode = "info_share" | "trade" | "pawahara_give" | "play_or_skip";

interface Props {
  mode: HandPickMode;
  view: GameView;
  playerId: string;
  selectedCardId: string | null;
  selectedPairType: CardType | null;
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

function pickConfig(mode: HandPickMode, view: GameView, playerId: string) {
  switch (mode) {
    case "info_share":
      return {
        title: "情報共有",
        description: `左隣の ${leftNeighborName(view, playerId)} に渡すカードを1枚選んでください`,
        accent: "info_share" as const,
      };
    case "trade": {
      const partner = tradePartnerName(view, playerId);
      return {
        title: "取引",
        description: partner
          ? `${partner} と交換するカードを1枚選んでください`
          : "交換するカードを1枚選んでください",
        accent: "trade" as const,
      };
    }
    case "pawahara_give":
      return {
        title: "パワハラ",
        description: "相手に渡すカードを1枚選んでください",
        accent: "pawahara" as const,
      };
    case "play_or_skip":
      return {
        title: "ペアを出す",
        description: "出したいペアのカードを1枚タップしてください",
        accent: "play" as const,
      };
  }
}

export function HandPickBanner({
  mode,
  view,
  playerId,
  selectedCardId,
  selectedPairType,
}: Props) {
  const config = pickConfig(mode, view, playerId);
  const step = mode === "play_or_skip" ? (selectedPairType ? 2 : 1) : selectedCardId ? 2 : 1;
  const selectedCard =
    selectedCardId != null ? view.myHand.find((c) => c.id === selectedCardId) : null;
  const selectedType = mode === "play_or_skip" ? selectedPairType : selectedCard?.type;

  const tradeStatus =
    mode === "trade" && view.pending?.tradeReady
      ? Object.entries(view.pending.tradeReady)
          .filter(([, ready]) => ready)
          .map(([id]) => view.seats.find((s) => s.playerId === id)?.name ?? "?")
          .join("、")
      : null;

  return (
    <div className={`hand-pick-banner hand-pick-banner--${config.accent}`}>
      <p className="hand-pick-banner__eyebrow">あなたの操作</p>
      <h3 className="hand-pick-banner__title">{config.title}</h3>
      <p className="hand-pick-banner__desc">{config.description}</p>

      {mode === "trade" && tradeStatus && (
        <p className="hand-pick-banner__status">選択済み: {tradeStatus}</p>
      )}

      <ol className={`hand-pick-banner__steps hand-pick-banner__steps--step${step}`}>
        <li className={step >= 1 ? "is-active" : ""}>
          <span className="hand-pick-banner__step-num">1</span>
          {mode === "play_or_skip" ? "ペアになるカードをタップ" : "渡す・交換するカードをタップ"}
        </li>
        <li className={step >= 2 ? "is-active" : ""}>
          <span className="hand-pick-banner__step-num">2</span>
          {mode === "play_or_skip" ? "下のボタンでペアを出す" : "同じカードをもう一度タップで確定"}
        </li>
      </ol>

      {step === 2 && selectedType && mode !== "play_or_skip" && (
        <div className="hand-pick-banner__preview">
          <PlayingCard cardType={selectedType} size="sm" selected confirmReady />
          <p>
            <strong>{CARD_LABELS[selectedType]}</strong> — もう一度タップで確定
          </p>
        </div>
      )}

      <p className="hand-pick-banner__pointer" aria-hidden>
        ↓ 下の手札から選ぶ
      </p>
    </div>
  );
}
