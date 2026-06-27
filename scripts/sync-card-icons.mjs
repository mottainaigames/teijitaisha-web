/**
 * アイコン/ → public/cards/icons へ同期。
 * 256px キャンバス内で絵の見た目サイズを揃える（トリム → 統一スケール → 中央配置）。
 * 用法: node scripts/sync-card-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(ROOT, "../アイコン");
const ICON_DIR = path.join(ROOT, "../apps/web/public/cards/icons");
const BACK_DST = path.join(ROOT, "../apps/web/public/cards/back.png");

const CANVAS = 256;
/** 絵本体の長辺をこのサイズに揃える（余白約9%） */
const CONTENT_MAX = 208;

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

async function getContentBounds(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function normalizeIcon(srcPath, dstPath) {
  const bounds = await getContentBounds(srcPath);
  if (!bounds) {
    fs.copyFileSync(srcPath, dstPath);
    return;
  }

  const cropped = await sharp(srcPath)
    .ensureAlpha()
    .extract(bounds)
    .png()
    .toBuffer();

  const scale = CONTENT_MAX / Math.max(bounds.width, bounds.height);
  const w = Math.max(1, Math.round(bounds.width * scale));
  const h = Math.max(1, Math.round(bounds.height * scale));
  const left = Math.round((CANVAS - w) / 2);
  const top = Math.round((CANVAS - h) / 2);

  const scaled = await sharp(cropped).resize(w, h, { fit: "fill" }).png().toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left, top }])
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(dstPath);

  const kb = Math.round(fs.statSync(dstPath).size / 1024);
  console.log(`${path.basename(dstPath)}: ${kb}KB (${w}x${h} in ${CANVAS})`);
}

async function copyBack() {
  const backSrc = resolveSrc("カード裏.png");
  if (!backSrc) return;
  await sharp(backSrc)
    .resize(136, 192, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(BACK_DST);
  console.log(`back.png: ${Math.round(fs.statSync(BACK_DST).size / 1024)}KB`);
}

fs.mkdirSync(ICON_DIR, { recursive: true });
for (const [srcName, dstName] of MAP) {
  const src = resolveSrc(srcName);
  if (!src) {
    console.warn(`skip (missing): ${srcName}`);
    continue;
  }
  await normalizeIcon(src, path.join(ICON_DIR, dstName));
}
await copyBack();
