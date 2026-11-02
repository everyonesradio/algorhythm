/**
 * Catalog cleanup for vinyl-first ingest.
 *
 *   npm run vinyl:status                    # record vinyl status where missing
 *   npm run vinyl:status -- --recheck       # re-check every album
 *   npm run vinyl:status -- --dry-run       # check, print, write nothing
 *   npm run vinyl:status -- --prune         # list albums never on vinyl
 *   npm run vinyl:status -- --prune --yes   # ...and delete them + vectors
 *
 * Status comes from MusicBrainz (official releases with a vinyl medium,
 * one request per artist page) and, when MusicBrainz shows none, Discogs
 * official vinyl releases (needs DISCOGS_TOKEN; without it those albums
 * stay "unknown"). Pruning never touches "unknown" albums or albums someone
 * confirmed a scan of.
 */
import "./lib/load-env";

import { parseArgs } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  discogsEnabled,
  discogsOfficialVinyl,
} from "@/server/services/catalog/discogs";
import { officialReleasesWithMedia } from "@/server/services/catalog/musicbrainz";
import {
  pruneAlbums,
  pruneCandidates,
  recordVinylStatus,
} from "@/server/services/catalog/vinyl-cleanup";

const { values } = parseArgs({
  options: {
    recheck: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    prune: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

const prisma = new PrismaClient();
const log = (m: string) => console.log("[vinyl]", m);

const main = async () => {
  if (!discogsEnabled()) {
    log(
      "DISCOGS_TOKEN not set: albums MusicBrainz shows without vinyl stay 'unknown'"
    );
  }
  const results = await recordVinylStatus(
    prisma,
    {
      releasesByArtist: (artist) => officialReleasesWithMedia({ artist }),
      releasesByReleaseGroup: (releaseGroup) =>
        officialReleasesWithMedia({ releaseGroup }),
      discogsVinyl: discogsOfficialVinyl,
      log,
    },
    { recheck: values.recheck, dryRun: values["dry-run"] }
  );
  const count = (s: string) =>
    results.filter((r) => r.vinyl.status === s).length;
  log(
    `checked ${results.length}: ${count("yes")} on vinyl, ${count("no")} not, ${count("unknown")} unknown` +
      (values["dry-run"] ? " (dry run, nothing written)" : "")
  );

  if (!values.prune) return;
  const { prune, keptScanned } = await pruneCandidates(prisma);
  for (const a of keptScanned)
    log(`keep (someone scanned it): ${a.artist} - ${a.title}`);
  for (const a of prune)
    log(
      `${values.yes ? "remove" : "would remove"}: ${a.artist} - ${a.title}${a.releaseYear ? ` (${a.releaseYear})` : ""}`
    );
  if (!values.yes) {
    log(
      `${prune.length} albums never pressed on vinyl. Re-run with --prune --yes to delete them and their vectors.`
    );
    return;
  }
  const removed = await pruneAlbums(
    prisma,
    prune.map((a) => a.id)
  );
  log(`removed ${removed.albums} albums and ${removed.vectors} vectors`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
