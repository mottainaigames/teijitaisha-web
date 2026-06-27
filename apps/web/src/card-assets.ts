import type { CardType } from "@teijitaisha/shared";
import { ICON_VERSION } from "./icon-version.js";

const iconUrl = (file: string) => `/cards/icons/${file}?v=${ICON_VERSION}`;

/** カード種別ごとの背景・文字色（帯なし・視認性重視） */
export interface CardTheme {
  bg: string;
  label: string;
  border: string;
}

export const CARD_THEMES: Record<CardType, CardTheme> = {
  norma: { bg: "#ffe4e4", label: "#991b1b", border: "#f87171" },
  rouki: { bg: "#ffedd5", label: "#9a3412", border: "#fb923c" },
  nomikai: { bg: "#fef3c7", label: "#92400e", border: "#fbbf24" },
  shanai_renai: { bg: "#fce7f3", label: "#9d174d", border: "#f472b6" },
  shinjin_kyouiku: { bg: "#cffafe", label: "#0e7490", border: "#22d3ee" },
  jouhou_kyouyu: { bg: "#d1fae5", label: "#047857", border: "#34d399" },
  torihiki: { bg: "#ecfccb", label: "#365314", border: "#a3e635" },
  enadori: { bg: "#dcfce7", label: "#166534", border: "#4ade80" },
  kaigi: { bg: "#dbeafe", label: "#1e40af", border: "#60a5fa" },
  pawahara: { bg: "#ede9fe", label: "#6b21a8", border: "#a78bfa" },
  tabako_kyuukei: { bg: "#e2e8f0", label: "#334155", border: "#94a3b8" },
  zangyo: { bg: "#ffffff", label: "#171717", border: "#000000" },
};

export const CARD_ICON_URLS: Record<CardType, string> = {
  norma: iconUrl("norma.png"),
  rouki: iconUrl("rouki.png"),
  nomikai: iconUrl("nomikai.png"),
  shanai_renai: iconUrl("shanai_renai.png"),
  shinjin_kyouiku: iconUrl("shinjin_kyouiku.png"),
  jouhou_kyouyu: iconUrl("jouhou_kyouyu.png"),
  torihiki: iconUrl("torihiki.png"),
  enadori: iconUrl("enadori.png"),
  kaigi: iconUrl("kaigi.png"),
  pawahara: iconUrl("pawahara.png"),
  tabako_kyuukei: iconUrl("tabako_kyuukei.png"),
  zangyo: iconUrl("zangyo.png"),
};

export const CARD_BACK_URL = `/cards/back.png?v=${ICON_VERSION}`;
