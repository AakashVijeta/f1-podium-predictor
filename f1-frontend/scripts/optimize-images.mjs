import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const SRC_ASSETS = join(ROOT, "src", "assets");

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function emit(inputPath, outBase, { widths = [null], avifQ = 60, webpQ = 75 } = {}) {
  if (!(await exists(inputPath))) {
    console.warn(`skip (missing): ${inputPath}`);
    return;
  }
  await mkdir(dirname(outBase), { recursive: true });
  for (const w of widths) {
    const suffix = w ? `-${w}w` : "";
    const base = `${outBase}${suffix}`;
    const pipe = sharp(inputPath);
    if (w) pipe.resize({ width: w, withoutEnlargement: true });

    const writes = [];
    const avifOut = `${base}.avif`;
    const webpOut = `${base}.webp`;
    const pngOut  = `${base}.png`;

    if (avifOut !== inputPath) writes.push(pipe.clone().avif({ quality: avifQ, effort: 6 }).toFile(avifOut));
    if (webpOut !== inputPath) writes.push(pipe.clone().webp({ quality: webpQ, effort: 6 }).toFile(webpOut));
    if (pngOut  !== inputPath) writes.push(pipe.clone().png({ compressionLevel: 9, palette: true }).toFile(pngOut));
    await Promise.all(writes);

    console.log(`  wrote ${base}.{avif,webp,png}`);
  }
}

async function main() {
  console.log("Optimizing images...");

  // Logo: single size; overwrite logo.png with optimized
  await emit(join(PUBLIC, "logo.png"), join(PUBLIC, "logo"), {
    widths: [null],
    avifQ: 70,
    webpQ: 80,
  });

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
