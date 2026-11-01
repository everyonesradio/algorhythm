/**
 * Creates the Atlas Vector Search index on CoverEmbedding.vector.
 *
 *   npm run vinyl:index
 *
 * Needs MongoDB Atlas (M0 free tier works) or the mongodb-atlas-local docker
 * image. `prisma db push` creates the regular indexes; search indexes have to
 * be created with this command. The index builds asynchronously, so give it a
 * minute after the first run.
 */
import { PrismaClient } from "@prisma/client";

import {
  ACTIVE_EMBEDDING_MODEL,
  COVER_VECTOR_INDEX,
  EMBEDDING_MODELS,
} from "@/lib/embeddings/config";

const prisma = new PrismaClient();

const main = async () => {
  const dims = EMBEDDING_MODELS[ACTIVE_EMBEDDING_MODEL].dims;
  const definition = {
    fields: [
      { type: "vector", path: "vector", numDimensions: dims, similarity: "cosine" },
      // Pre-filter so models with different vector spaces never mix.
      { type: "filter", path: "model" },
      { type: "filter", path: "source" },
    ],
  };

  const existing = (await prisma.$runCommandRaw({
    aggregate: "CoverEmbedding",
    pipeline: [{ $listSearchIndexes: { name: COVER_VECTOR_INDEX } }],
    cursor: {},
  })) as { cursor: { firstBatch: unknown[] } };

  if (existing.cursor.firstBatch.length > 0) {
    await prisma.$runCommandRaw({
      updateSearchIndex: "CoverEmbedding",
      name: COVER_VECTOR_INDEX,
      definition,
    });
    console.log(`Updated ${COVER_VECTOR_INDEX} (${dims} dims)`);
  } else {
    await prisma.$runCommandRaw({
      createSearchIndexes: "CoverEmbedding",
      indexes: [{ name: COVER_VECTOR_INDEX, type: "vectorSearch", definition }],
    });
    console.log(`Created ${COVER_VECTOR_INDEX} (${dims} dims)`);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
