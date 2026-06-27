/**
 * アイコン/ の PNG を public/cards/ へそのまま同期する（画質劣化なし）。
 * 用法: node scripts/sync-card-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(ROOT, "../アイコン");
const ICON_DIR = path.join(ROOT, "../apps/web/public/cards/icons");
const BACK_DST = path.join(ROOT, "../apps/web/public/cards/back.png");

const MAP = [
  ["ノルマ.png", "norma.png"],
  ["労基.png", "rouki.png"],
  ["飲み会.png", "nomikai.png"],
  ["社内恋愛.png", "shanai_renai.png"],
  ["新人教育.PNG", "shinjin_kyouiku.png"],
  ["情報共有.PNG", "jouhou_kyouyu.png"],
  ["取引.PNG", "torihiki.png"],
  ["エナドリ.PNG", "enadori.png"],
  ["会議.PNG", "kaigi.png"],
  ["パワハラ.PNG", "pawahara.png"],
  ["タバコ休憩.PNG", "tabako_kyuukei.png"],
  ["残業.PNG", "zangyo.png"],
];

function resolveSrc(baseName) {
  const exact = path.join(SRC_DIR, baseName);
  if (fs.existsSync(exact)) return exact;
  const lower = path.join(SRC_DIR, baseName.replace(/\.PNG$/i, ".png"));
  if (fs.existsSync(lower)) return lower;
  const entries = fs.readdirSync(SRC_DIR);
  const stem = baseName.replace(/\.png$/i, "");
  const match = entries.find((e) => e.replace(/\.png$/i, "") === stem);
  return match ? path.join(SRC_DIR, match) : null;
}

function copy(srcName, dstName) {
  const src = resolveSrc(srcName);
  if (!src) {
    console.warn(`skip (missing): ${srcName}`);
    return;
  }
  const dst = path.join(ICON_DIR, dstName);
  fs.copyFileSync(src, dst);
  const kb = Math.round(fs.statSync(dst).size / 1024);
  console.log(`${dstName}: ${kb}KB`);
}

fs.mkdirSync(ICON_DIR, { recursive: true });
for (const [src, dst] of MAP) copy(src, dst);

const backSrc = path.join(SRC_DIR, "カード裏.png");
if (fs.existsSync(backSrc)) {
  fs.copyFileSync(backSrc, BACK_DST);
  console.log(`back.png: ${Math.round(fs.statSync(BACK_DST).size / 1024)}KB`);
}
