import type { PrismaClient } from "@prisma/client";

import {
  COVER_VECTOR_INDEX,
  type EmbeddingModelKey,
} from "@/lib/embeddings/config";
import { atlasScoreToCosine, dot } from "@/lib/embeddings/vector";

import type { VectorHit } from "./ranking";

export const vectorSearchMode = (): "atlas" | "local" =>
  process.env.VECTOR_SEARCH_MODE === "local" ? "local" : "atlas";

type AtlasRow = {
  albumId: { $oid: string } | string;
  score: number;
  source?: string;
  imageUrl?: string | null;
};

const oid = (v: AtlasRow["albumId"]) => (typeof v === "string" ? v : v.$oid);

export const findNearestCovers = async (
  prisma: PrismaClient,
  vector: number[],
  model: EmbeddingModelKey,
  k = 20
): Promise<VectorHit[]> => {
  if (vectorSearchMode() === "local") {
    return findNearestCoversLocal(prisma, vector, model, k);
  }

  const rows = (await prisma.coverEmbedding.aggregateRaw({
    pipeline: [
      {
        $vectorSearch: {
          index: COVER_VECTOR_INDEX,
          path: "vector",
          queryVector: vector,
          numCandidates: Math.max(k * 15, 150),
          limit: k,
          filter: { model: { $eq: model } },
        },
      },
      {
        $project: {
          _id: 0,
          albumId: 1,
          source: 1,
          imageUrl: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ],
  })) as unknown as AtlasRow[];

  return rows.map((r) => ({
    albumId: oid(r.albumId),
    similarity: atlasScoreToCosine(r.score),
    source: r.source,
    imageUrl: r.imageUrl ?? null,
  }));
};

const findNearestCoversLocal = async (
  prisma: PrismaClient,
  vector: number[],
  model: EmbeddingModelKey,
  k: number
): Promise<VectorHit[]> => {
  const all = await prisma.coverEmbedding.findMany({
    where: { model },
    select: { albumId: true, vector: true, source: true, imageUrl: true },
  });
  return all
    .filter((e) => e.vector.length === vector.length)
    .map((e) => ({
      albumId: e.albumId,
      similarity: dot(vector, e.vector),
      source: e.source,
      imageUrl: e.imageUrl,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
};
