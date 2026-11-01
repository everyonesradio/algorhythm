/**
 * Build a synthetic evaluation set for `npm run vinyl:eval` when you don't
 * have phone photos yet.
 *
 *   npm run vinyl:synth -- --out ./eval-synthetic [--per-album 2] [--negatives 15]
 *
 * Positives: for each seeded album, the 1200px Cover Art Archive scan (the
 * index used 500px) is rendered like a phone snapshot: shrunk onto a
 * cluttered background with a tilt, off-centre framing, a glare hotspot,
 * a colour cast and heavy JPEG compression. These transforms intentionally
 * differ from the seeder's --augment ones so the test isn't self-fulfilling.
 *
 * Negatives: covers of albums that are NOT in the index (from a MusicBrainz
 * tag search), to measure false auto-matches.
 *
 * Synthetic photos are a proxy. Re-run vinyl:eval on real photos before
 * trusting the thresholds in production.
 */
import "./lib/load-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

import {
  coverArtUrl,
  fetchImage,
  releaseGroupsForTag,
} from "@/server/services/catalog/musicbrainz";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "./eval-synthetic" },
    "per-album": { type: "string", default: "2" },
    negatives: { type: "string", default: "15" },
    "negative-tag": { type: "string", default: "jazz" },
    seed: { type: "string", default: "7" },
  },
});

// Small deterministic PRNG so runs are reproducible.
let state = Number(values.seed);
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const between = (a: number, b: number) => a + (b - a) * rand();

const prisma = new PrismaClient();

const background = async (size: number) => {
  // Wood-ish / table-ish noise backdrop with random tone.
  const tone = { r: between(60, 170), g: between(50, 140), b: between(40, 120) };
  const noise = Buffer.alloc(size * size * 3);
  for (let i = 0; i < noise.length; i += 3) {
    const n = between(-25, 25);
    noise[i] = Math.max(0, Math.min(255, tone.r + n));
    noise[i + 1] = Math.max(0, Math.min(255, tone.g + n));
    noise[i + 2] = Math.max(0, Math.min(255, tone.b + n));
  }
  return sharp(noise, { raw: { width: size, height: size, channels: 3 } })
    .blur(2)
    .png()
    .toBuffer();
};

const glare = (size: number) => {
  const cx = Math.round(between(0.2, 0.8) * size);
  const cy = Math.round(between(0.2, 0.8) * size);
  const r = Math.round(between(0.15, 0.35) * size);
  const a = between(0.25, 0.55).toFixed(2);
  return Buffer.from(
    `<svg width="${size}" height="${size}"><defs><radialGradient id="g">` +
      `<stop offset="0" stop-color="white" stop-opacity="${a}"/>` +
      `<stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)"/></svg>`
  );
};

/** Render a cover as a casual phone photo. */
const phoneShot = async (cover: Buffer) => {
  const canvas = 1000;
  const coverSize = Math.round(between(0.62, 0.8) * canvas);
  const tilted = await sharp(cover)
    .resize(coverSize, coverSize, { fit: "cover" })
    .affine([1, between(-0.06, 0.06), between(-0.06, 0.06), 1], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .rotate(between(-7, 7), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(tilted).metadata();
  const w = meta.width ?? coverSize;
  const h = meta.height ?? coverSize;
  const left = Math.round((canvas - w) / 2 + between(-0.06, 0.06) * canvas);
  const top = Math.round((canvas - h) / 2 + between(-0.06, 0.06) * canvas);

  return sharp(await background(canvas))
    .composite([
      { input: tilted, left: Math.max(0, left), top: Math.max(0, top) },
      { input: glare(canvas), left: 0, top: 0 },
    ])
    .modulate({
      brightness: between(0.75, 1.2),
      saturation: between(0.75, 1.1),
    })
    .tint({ r: 255, g: Math.round(between(220, 255)), b: Math.round(between(190, 245)) })
    .blur(between(0.4, 1.4))
    .jpeg({ quality: Math.round(between(45, 70)) })
    .toBuffer();
};

const main = async () => {
  const out = values.out;
  mkdirSync(out, { recursive: true });
  const perAlbum = Number(values["per-album"]);

  const albums = await prisma.album.findMany({
    where: { mbid: { not: null } },
    select: { mbid: true, artist: true, title: true },
  });
  console.log(`[synth] ${albums.length} seeded albums`);

  let positives = 0;
  for (const album of albums) {
    const cover = await fetchImage(coverArtUrl(album.mbid!, 1200));
    if (!cover) continue;
    for (let i = 0; i < perAlbum; i++) {
      writeFileSync(join(out, `${album.mbid}-synth${i + 1}.jpg`), await phoneShot(cover));
      positives++;
    }
  }

  const seeded = new Set(albums.map((a) => a.mbid));
  const wanted = Number(values.negatives);
  const pool = await releaseGroupsForTag(values["negative-tag"], wanted * 4);
  let negatives = 0;
  for (const rg of pool) {
    if (negatives >= wanted) break;
    if (seeded.has(rg.id)) continue;
    const cover = await fetchImage(coverArtUrl(rg.id, 500));
    if (!cover) continue;
    negatives++;
    writeFileSync(
      join(out, `negative-${String(negatives).padStart(2, "0")}.jpg`),
      await phoneShot(cover)
    );
  }

  console.log(`[synth] wrote ${positives} positives and ${negatives} negatives to ${out}`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
