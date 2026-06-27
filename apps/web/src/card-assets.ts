import type { CardType } from "@teijitaisha/shared";

/** カード種別ごとの背景・文字色（帯なし・視認性重視） */
export interface CardTheme {
  bg: string;
  label: string;
  border: string;
}

export const CARD_THEMES: Record<CardType, CardTheme> = {
  norma: { bg: "#fff5f5", label: "#b91c1c", border: "#fecaca" },
  rouki: { bg: "#fff7ed", label: "#c2410c", border: "#fed7aa" },
  nomikai: { bg: "#fffbeb", label: "#a16207", border: "#fde68a" },
  shanai_renai: { bg: "#fdf2f8", label: "#be185d", border: "#fbcfe8" },
  shinjin_kyouiku: { bg: "#ecfeff", label: "#0e7490", border: "#a5f3fc" },
  jouhou_kyouyu: { bg: "#ecfdf5", label: "#047857", border: "#6ee7b7" },
  torihiki: { bg: "#f7fee7", label: "#3f6212", border: "#bef264" },
  enadori: { bg: "#f0fdf4", label: "#15803d", border: "#86efac" },
  kaigi: { bg: "#eff6ff", label: "#1d4ed8", border: "#93c5fd" },
  pawahara: { bg: "#faf5ff", label: "#7e22ce", border: "#d8b4fe" },
  tabako_kyuukei: { bg: "#f8fafc", label: "#475569", border: "#cbd5e1" },
  zangyo: { bg: "#27272a", label: "#f4f4f5", border: "#52525b" },
};

export const CARD_ICON_URLS: Record<CardType, string> = {
  norma: "/cards/icons/norma.png",
  rouki: "/cards/icons/rouki.png",
  nomikai: "/cards/icons/nomikai.png",
  shanai_renai: "/cards/icons/shanai_renai.png",
  shinjin_kyouiku: "/cards/icons/shinjin_kyouiku.png",
  jouhou_kyouyu: "/cards/icons/jouhou_kyouyu.png",
  torihiki: "/cards/icons/torihiki.png",
  enadori: "/cards/icons/enadori.png",
  kaigi: "/cards/icons/kaigi.png",
  pawahara: "/cards/icons/pawahara.png",
  tabako_kyuukei: "/cards/icons/tabako_kyuukei.png",
  zangyo: "/cards/icons/zangyo.png",
};

export const CARD_BACK_URL = "/cards/back.png";
