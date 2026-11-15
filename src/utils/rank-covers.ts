import { dot } from "@/lib/embeddings/vector";

import { centerSquareCrop, cropToImageData } from "./frame-crop";

export const rankCoversByScan = async <T extends { thumbUrl: string }>(
  items: T[],
  scanVector: number[],
  embed: (image: ImageData) => Promise<number[]>,
  opts: { limit?: number; signal?: AbortSignal; concurrency?: number } = {}
): Promise<(T & { similarity: number | null })[]> => {
  const canvas = document.createElement("canvas");
  const pool = items.slice(0, opts.limit ?? 12);

  const bitmaps: Promise<ImageBitmap | null>[] = new Array(pool.length);
  let next = 0;
  const loadOne = async (i: number) => {
    try {
      const res = await fetch(pool[i].thumbUrl, { signal: opts.signal });
      return res.ok ? await createImageBitmap(await res.blob()) : null;
    } catch {
      return null;
    }
  };
  const resolvers: ((b: ImageBitmap | null) => void)[] = [];
  pool.forEach((_, i) => {
    bitmaps[i] = new Promise((r) => (resolvers[i] = r));
  });
  const worker = async () => {
    while (next < pool.length && !opts.signal?.aborted) {
      const i = next++;
      resolvers[i](await loadOne(i));
    }
  };
  void Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? 6, pool.length) }, worker)
  );

  const scored: (T & { similarity: number | null })[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (opts.signal?.aborted) break;
    const bitmap = await bitmaps[i];
    let similarity: number | null = null;
    if (bitmap) {
      const image = cropToImageData(
        bitmap,
        centerSquareCrop(bitmap.width, bitmap.height, 1),
        canvas
      );
      bitmap.close();
      try {
        if (image) similarity = dot(scanVector, await embed(image));
      } catch {}
    }
    scored.push({ ...pool[i], similarity });
  }
  return sortBySimilarity(scored);
};

export const sortBySimilarity = <T extends { similarity: number | null }>(
  xs: T[]
) =>
  xs
    .map((x, i) => ({ x, i }))
    .sort(
      (a, b) =>
        (b.x.similarity ?? -Infinity) - (a.x.similarity ?? -Infinity) ||
        a.i - b.i
    )
    .map(({ x }) => x);
