/**
 * Measure recognition quality on real phone photos and calibrate thresholds.
 *
 *   npm run vinyl:eval -- --dir ./eval-photos [--crop 0.9]
 *
 * Name each photo after the MusicBrainz release-group id it shows, e.g.
 *   eval-photos/3f6a3c1e-....jpg   eval-photos/3f6a3c1e-...-angle2.jpg
 * Photos of records that are NOT in the index (named anything without an
 * mbid, e.g. negative-01.jpg) measure false positives.
 *
 * Prints top-1 / top-5 accuracy, how often each decision fires, and the
 * similarity distribution of right vs wrong top hits so you can set
 * DEFAULT_THRESHOLDS in src/server/services/vinyl/ranking.ts with data.
 */
import "./lib/load-env";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import { ACTIVE_EMBEDDING_MODEL } from "@/lib/embeddings/config";
import { loadEmbedder } from "@/lib/embeddings/embedder";
import { findNearestCovers } from "@/server/services/vinyl/index-search";
import { rankHits } from "@/server/services/vinyl/ranking";

import { centerSquare, toRawImage } from "./lib/images";


const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    crop: { type: "string", default: "1" },
  },
});
if (!values.dir) throw new Error("--dir is required");

const MBID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const prisma = new PrismaClient();

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const summary = (xs: number[]) => {
  if (!xs.length) return "n/a";
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3);
  return `min ${at(0)}  p10 ${at(0.1)}  p50 ${at(0.5)}  p90 ${at(0.9)}  max ${at(0.999)}`;
};

const main = async () => {
  const embedder = await loadEmbedder(ACTIVE_EMBEDDING_MODEL, { device: "cpu" });
  const files = readdirSync(values.dir!).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  let positives = 0, top1 = 0, top5 = 0, falseMatch = 0, negatives = 0;
  const status = { matched: 0, ambiguous: 0, none: 0 };
  const rightTop: number[] = [];
  const wrongTop: number[] = [];

  for (const file of files) {
    const expected = (MBID.exec(file))?.[0]?.toLowerCase() ?? null;
    const img = await centerSquare(readFileSync(join(values.dir!, file)), Number(values.crop));
    const vector = await embedder.embed(await toRawImage(embedder, img));
    const hits = await findNearestCovers(prisma, vector, ACTIVE_EMBEDDING_MODEL, 50);
    const ranked = rankHits(hits, 5, { match: -1, margin: -1, candidate: -1 });
    const decision = rankHits(hits);
    status[decision.status]++;

    const albums = await prisma.album.findMany({
      where: { id: { in: ranked.candidates.map((c) => c.albumId) } },
      select: { id: true, mbid: true, artist: true, title: true },
    });
    const mbidOf = new Map(albums.map((a) => [a.id, a.mbid?.toLowerCase()]));
    const top = ranked.candidates[0];
    const topMbid = top ? mbidOf.get(top.albumId) : undefined;

    if (expected) {
      positives++;
      const rank = ranked.candidates.findIndex((c) => mbidOf.get(c.albumId) === expected);
      if (rank === 0) top1++;
      if (rank >= 0) top5++;
      if (top) (topMbid === expected ? rightTop : wrongTop).push(top.similarity);
      if (decision.status === "matched" && topMbid !== expected) falseMatch++;
    } else {
      negatives++;
      if (top) wrongTop.push(top.similarity);
      if (decision.status === "matched") falseMatch++;
    }

    const name = albums.find((a) => a.id === top?.albumId);
    console.log(
      `${file.padEnd(48)} ${decision.status.padEnd(9)} ${top?.similarity.toFixed(3) ?? "-"}  ` +
        `${name ? `${name.artist} - ${name.title}` : "-"}`
    );
  }

  console.log("\n=== results ===");
  console.log(`photos: ${files.length} (in index: ${positives}, not in index: ${negatives})`);
  console.log(`top-1 accuracy: ${pct(top1, positives)}   top-5: ${pct(top5, positives)}`);
  console.log(
    `decisions: matched ${status.matched}, ambiguous ${status.ambiguous}, none ${status.none}`
  );
  console.log(`wrong auto-matches: ${falseMatch}  (keep this at 0)`);
  console.log(`similarity of correct top hit:   ${summary(rightTop)}`);
  console.log(`similarity of incorrect top hit: ${summary(wrongTop)}`);
  console.log(
    "\nSet `match` above the incorrect p90+ and `candidate` near the correct p10."
  );
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
