import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(ROOT, "../apps/web/public/cards/icons");
const BACK_PATH = path.join(ROOT, "../apps/web/public/cards/back.png");

function detectBackgroundType(data, width, height, channels) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let black = 0;
  let white = 0;
  for (const [x, y] of corners) {
    const p = (y * width + x) * channels;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (r < 30 && g < 30 && b < 30) black++;
    else if (r > 240 && g > 240 && b > 240) white++;
  }
  if (black >= 3) return "black";
  if (white >= 3) return "white";
  return "mixed";
}

function isBackground(r, g, b, type) {
  if (type === "black") return r < 30 && g < 30 && b < 30;
  if (type === "white") return r > 240 && g > 240 && b > 240;
  if (r > 248 && g > 248 && b > 248) return true;
  if (r < 20 && g < 20 && b < 20) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 22 && min >= 165 && max <= 245) return true;
  return false;
}

function removeBackground(data, width, height, channels) {
  const type = detectBackgroundType(data, width, height, channels);
  const visited = new Uint8Array(width * height);
  const queue = [];

  const pushIfBg = (x, y) => {
    const i = y * width + x;
    if (visited[i]) return;
    const p = i * channels;
    if (!isBackground(data[p], data[p + 1], data[p + 2], type)) return;
    visited[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (queue.length > 0) {
    const i = queue.pop();
    const p = i * channels;
    data[p + 3] = 0;

    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) pushIfBg(x - 1, y);
    if (x < width - 1) pushIfBg(x + 1, y);
    if (y > 0) pushIfBg(x, y - 1);
    if (y < height - 1) pushIfBg(x, y + 1);
  }
}

async function processIcon(filePath) {
  const before = fs.statSync(filePath).size;
  const meta = await sharp(filePath).metadata();
  let pipeline = sharp(filePath).ensureAlpha();
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > 128) {
    pipeline = pipeline.resize(128, 128, { fit: "inside", withoutEnlargement: true });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data);
  removeBackground(buf, info.width, info.height, info.channels);

  const tmp = `${filePath}.tmp`;
  await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(tmp);
  fs.renameSync(tmp, filePath);
  const after = fs.statSync(filePath).size;
  console.log(`${path.basename(filePath)}: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);
}

async function processBack(filePath) {
  const before = fs.statSync(filePath).size;
  const tmp = `${filePath}.tmp`;
  await sharp(filePath)
    .resize(136, 192, { fit: "cover" })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(tmp);
  fs.renameSync(tmp, filePath);
  const after = fs.statSync(filePath).size;
  console.log(`back.png: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`);
}

const iconFiles = fs.readdirSync(ICON_DIR).filter((f) => f.endsWith(".png"));
for (const file of iconFiles) {
  await processIcon(path.join(ICON_DIR, file));
}
await processBack(BACK_PATH);
