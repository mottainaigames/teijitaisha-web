import type { CardType } from "@teijitaisha/shared";
import { ICON_VERSION } from "./icon-version.js";

const iconUrl = (file: string) => `/cards/icons/${file}?v=${ICON_VERSION}`;

/** カード種別ごとの色（実物カードの名前帯の色に合わせる） */
export interface CardTheme {
  bg: string;
  label: string;
  border: string;
}

export const CARD_THEMES: Record<CardType, CardTheme> = {
  norma: { bg: "#fbfaf5", label: "#fff", border: "#ff8989" },
  rouki: { bg: "#fbfaf5", label: "#fff", border: "#ffb08a" },
  nomikai: { bg: "#fbfaf5", label: "#fff", border: "#f2c200" },
  shanai_renai: { bg: "#fbfaf5", label: "#fff", border: "#f5a3ea" },
  shinjin_kyouiku: { bg: "#fbfaf5", label: "#fff", border: "#5fd9d9" },
  jouhou_kyouyu: { bg: "#fbfaf5", label: "#fff", border: "#4fd9a8" },
  torihiki: { bg: "#fbfaf5", label: "#fff", border: "#8ed96a" },
  enadori: { bg: "#fbfaf5", label: "#fff", border: "#689b68" },
  kaigi: { bg: "#fbfaf5", label: "#fff", border: "#4870e9" },
  pawahara: { bg: "#fbfaf5", label: "#fff", border: "#8548ff" },
  tabako_kyuukei: { bg: "#fbfaf5", label: "#fff", border: "#a2a2b8" },
  zangyo: { bg: "#fbfaf5", label: "#fff", border: "#1b1f3b" },
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
