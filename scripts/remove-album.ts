/**
 * Remove an album that shouldn't be in the catalog (wrong artist, fan
 * upload...) together with its cover vectors.
 *
 *   npm run vinyl:remove -- --mbid <release-group id>          # dry run
 *   npm run vinyl:remove -- --mbid <release-group id> --yes    # delete
 *
 * Scan history (ScanEvent) is kept; it only references the album id.
 */
import "./lib/load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

const { values } = parseArgs({
  options: {
    mbid: { type: "string", multiple: true },
    yes: { type: "boolean", default: false },
  },
});

const prisma = new PrismaClient();

const main = async () => {
  const mbids = values.mbid ?? [];
  if (mbids.length === 0) {
    console.log(
      "Usage: npm run vinyl:remove -- --mbid <release-group id> [--yes]"
    );
    return;
  }
  for (const mbid of mbids) {
    const album = await prisma.album.findFirst({
      where: { OR: [{ mbid }, { sourceKey: `mb:${mbid}` }] },
      select: { id: true, title: true, artist: true, releaseYear: true },
    });
    if (!album) {
      console.log(`✗ not in the catalog: ${mbid}`);
      continue;
    }
    const vectors = await prisma.coverEmbedding.count({
      where: { albumId: album.id },
    });
    const label = `${album.artist} - ${album.title}${album.releaseYear ? ` (${album.releaseYear})` : ""}`;
    if (!values.yes) {
      console.log(
        `would remove: ${label} + ${vectors} vectors (re-run with --yes)`
      );
      continue;
    }
    await prisma.coverEmbedding.deleteMany({ where: { albumId: album.id } });
    await prisma.album.delete({ where: { id: album.id } });
    console.log(`removed: ${label} + ${vectors} vectors`);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
