/**
 * 表示テキストの辞書（言語切り替えの土台）。
 * 英語版（CLOCK OUT!）を出すときは `en` を埋め、カード名・効果は
 * packages/shared の CARD_LABELS / CARD_EFFECTS に英語版を足して差し替える。
 * 言語は URL の ?lang=en、または localStorage の "lang" で切り替える。
 */
const ja = {
  "phase.lobby": "ロビー",
  "phase.dealing": "配布中",
  "phase.draw": "カードを引く",
  "phase.play": "ペアを出す",
  "phase.effect": "効果処理",
  "phase.game_end": "ゲーム終了",
  "cardDetail.note": "ペアを場に出したときの効果",
  "cardDetail.close": "閉じる",
  "cardDetail.playPair": "このペアを出す",
  "cardDetail.infoShare": "このカードを出す",
  "cardDetail.trade": "このカードを交換に出す",
  "cardDetail.pawaharaGive": "このカードを渡す",
} as const;

export type MessageKey = keyof typeof ja;

const en: Partial<Record<MessageKey, string>> = {
  "phase.lobby": "Lobby",
  "phase.dealing": "Dealing",
  "phase.draw": "Draw",
  "phase.play": "Play a pair",
  "phase.effect": "Resolving",
  "phase.game_end": "Game over",
  "cardDetail.note": "Effect when played as a pair",
  "cardDetail.close": "Close",
  "cardDetail.playPair": "Play this pair",
  "cardDetail.infoShare": "Pass this card",
  "cardDetail.trade": "Offer this card",
  "cardDetail.pawaharaGive": "Give this card",
};

const dictionaries = { ja, en } as const;
export type Lang = keyof typeof dictionaries;

function detectLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "en" || q === "ja") {
      localStorage.setItem("lang", q);
      return q;
    }
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "ja") return saved;
  } catch {
    /* localStorage が使えない環境では日本語 */
  }
  return "ja";
}

export const lang: Lang = typeof window === "undefined" ? "ja" : detectLang();

export function t(key: MessageKey): string {
  return dictionaries[lang][key] ?? ja[key];
}
