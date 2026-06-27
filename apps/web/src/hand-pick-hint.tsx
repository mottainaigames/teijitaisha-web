import type { GameView } from "@teijitaisha/shared";

export type HandPickPurpose = "info_share" | "trade" | "pawahara_give" | "play_or_skip";

interface Props {
  mode: HandPickPurpose;
  view: GameView;
  playerId: string;
  submitted?: boolean;
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

function purposeLabel(mode: HandPickPurpose, view: GameView, playerId: string): string {
  switch (mode) {
    case "info_share":
      return `左隣の ${leftNeighborName(view, playerId)} に渡すカードを選ぶ`;
    case "trade": {
      const partner = tradePartnerName(view, playerId);
      return partner ? `${partner} と交換するカードを選ぶ` : "交換するカードを選ぶ";
    }
    case "pawahara_give":
      return "相手に渡すカードを選ぶ";
    case "play_or_skip":
      return "もう1組ペアを出すか、出さないを選ぶ";
  }
}

function waitingLabel(mode: HandPickPurpose, view: GameView, playerId: string): string {
  if (mode === "info_share") {
    return "選択済み — 全員が選び終わると左隣へ渡されます";
  }
  if (mode === "trade") {
    const partner = tradePartnerName(view, playerId);
    const partnerReady =
      view.pending?.type === "trade" && view.pending.tradeReady
        ? Object.entries(view.pending.tradeReady).some(([id, ready]) => id !== playerId && ready)
        : false;
    if (partnerReady) return "双方の選択が揃いました";
    return `${partner ?? "相手"}の選択を待っています…`;
  }
  return "";
}

export function HandPickHint({ mode, view, playerId, submitted }: Props) {
  const text = submitted ? waitingLabel(mode, view, playerId) : purposeLabel(mode, view, playerId);
  if (!text) return null;

  return (
    <p
      className={`hand-pick-hint hand-pick-hint--${mode}${submitted ? " hand-pick-hint--waiting" : ""}`}
    >
      {text}
    </p>
  );
}
