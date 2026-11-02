/**
 * Resolve and store streaming links for catalog albums ahead of time, so
 * the drawer and pasted links never wait on MusicBrainz.
 *
 *   npm run vinyl:links                 # albums without fresh links
 *   npm run vinyl:links -- --refresh    # every album
 *
 * About 1 MusicBrainz request per album (1/s). New albums from scan
 * ingest get their links automatically; this backfills the rest.
 */
import "./lib/load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import { albumLinkDeps, indexAlbumLinks } from "@/server/services/links/server";
import { freshCachedLinks, getAlbumLinks } from "@/server/services/vinyl/links";

const { values } = parseArgs({
  options: { refresh: { type: "boolean", default: false } },
});

const prisma = new PrismaClient();

const main = async () => {
  const albums = await prisma.album.findMany({
    select: { id: true, title: true, artist: true, platformLinks: true },
  });
  const todo = values.refresh
    ? albums
    : albums.filter((a) => !freshCachedLinks(a.platformLinks));
  console.log(`[links] ${todo.length} of ${albums.length} albums to resolve`);

  let withLinks = 0;
  for (const [i, a] of todo.entries()) {
    if (values.refresh) {
      await prisma.album.update({
        where: { id: a.id },
        data: { platformLinks: null },
      });
    }
    const res = await getAlbumLinks(prisma, a.id, albumLinkDeps, Date.now(), {
      onResolved: (album, links) => indexAlbumLinks(prisma, album, links),
    });
    const links = res.status === "ok" ? res.links : [];
    if (links.length) withLinks++;
    console.log(
      `[links] [${i + 1}/${todo.length}] ${a.artist} - ${a.title}: ${links.map((l) => l.type).join(", ") || "none"}`
    );
  }
  console.log(`[links] done: ${withLinks} of ${todo.length} have links`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
