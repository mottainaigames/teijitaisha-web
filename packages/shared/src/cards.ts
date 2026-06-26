/** カード種別（コード用スラッグ） */
export const CARD_TYPES = [
  "norma",
  "rouki",
  "nomikai",
  "shanai_renai",
  "shinjin_kyouiku",
  "jouhou_kyouyu",
  "torihiki",
  "enadori",
  "kaigi",
  "pawahara",
  "tabako_kyuukei",
  "zangyo",
] as const;

export type CardType = (typeof CARD_TYPES)[number];

/** 画面上の日本語名 */
export const CARD_LABELS: Record<CardType, string> = {
  norma: "ノルマ",
  rouki: "労基",
  nomikai: "飲み会",
  shanai_renai: "社内恋愛",
  shinjin_kyouiku: "新人教育",
  jouhou_kyouyu: "情報共有",
  torihiki: "取引",
  enadori: "エナドリ",
  kaigi: "会議",
  pawahara: "パワハラ",
  tabako_kyuukei: "タバコ休憩",
  zangyo: "残業",
};

/** ペアを場に出したときの効果（UI表示用） */
export const CARD_EFFECTS: Record<CardType, string> = {
  norma: "効果なし",
  rouki: "対象の手札から1枚選び公開する（残業なら即敗北、パワハラなら渡す）",
  nomikai: "次の手番の社員はペアを出せない",
  shanai_renai: "対象と互いの手札をすべて見せ合う",
  shinjin_kyouiku: "対象の手札を2枚まで見て、1枚加えてもよい",
  jouhou_kyouyu: "全員が手札から1枚選び、左隣に渡す",
  torihiki: "対象と手札を1枚ずつ選んで交換する",
  enadori: "このターン、もう1組ペアを出せる",
  kaigi: "残業を持つ社員は「持っています」と宣言する",
  pawahara: "対象を1人選び、自分の手札から1枚渡す",
  tabako_kyuukei: "手札のタバコ休憩をすべて場に出す",
  zangyo: "ペアにできない特殊カード（労基で公開されると即敗北）",
};

/** デッキ構成（確定版: 49枚） */
export const DECK_COMPOSITION: Record<CardType, number> = {
  norma: 4,
  rouki: 8,
  nomikai: 4,
  shanai_renai: 4,
  shinjin_kyouiku: 4,
  jouhou_kyouyu: 4,
  torihiki: 4,
  enadori: 4,
  kaigi: 4,
  pawahara: 4,
  tabako_kyuukei: 4,
  zangyo: 1,
};

export const TOTAL_DECK_SIZE = Object.values(DECK_COMPOSITION).reduce(
  (sum, n) => sum + n,
  0,
);

/** ペアを作れないカード */
export const NON_PAIRABLE: ReadonlySet<CardType> = new Set(["zangyo"]);

export function buildDeck(): CardType[] {
  const deck: CardType[] = [];
  for (const type of CARD_TYPES) {
    for (let i = 0; i < DECK_COMPOSITION[type]; i++) {
      deck.push(type);
    }
  }
  return deck;
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
