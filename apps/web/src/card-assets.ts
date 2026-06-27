import type { CardType } from "@teijitaisha/shared";

/** 物理カード（カード/）の帯色を参考にしたテーマ */
export interface CardTheme {
  band: string;
  accent: string;
  body: string;
  title: string;
}

export const CARD_THEMES: Record<CardType, CardTheme> = {
  norma: { band: "#ff8888", accent: "#e83838", body: "#ffffff", title: "#ffffff" },
  rouki: { band: "#ffc0a0", accent: "#ff5800", body: "#ffffff", title: "#ffffff" },
  nomikai: { band: "#ffd400", accent: "#e6b800", body: "#ffffff", title: "#ffffff" },
  shanai_renai: { band: "#ffbcf8", accent: "#e878e8", body: "#ffffff", title: "#ffffff" },
  shinjin_kyouiku: { band: "#88f4f4", accent: "#20c8c8", body: "#ffffff", title: "#ffffff" },
  jouhou_kyouyu: { band: "#68f8c8", accent: "#00c898", body: "#ffffff", title: "#ffffff" },
  torihiki: { band: "#b4ff8c", accent: "#58c838", body: "#ffffff", title: "#1a1a2e" },
  enadori: { band: "#689c68", accent: "#408040", body: "#ffffff", title: "#ffffff" },
  kaigi: { band: "#4870e8", accent: "#3040b8", body: "#ffffff", title: "#ffffff" },
  pawahara: { band: "#b868f0", accent: "#9040d0", body: "#ffffff", title: "#ffffff" },
  tabako_kyuukei: { band: "#b0b0b8", accent: "#787880", body: "#ffffff", title: "#ffffff" },
  zangyo: { band: "#6c6c7c", accent: "#484858", body: "#181818", title: "#ffffff" },
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
