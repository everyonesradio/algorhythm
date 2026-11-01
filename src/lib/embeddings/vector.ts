/** Small, dependency-free vector helpers shared by client, server and scripts. */

export const l2Normalize = (vec: ArrayLike<number>): number[] => {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
};

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length) {
    throw new Error(`Vector size mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/** Cosine similarity for vectors that may not be normalized. */
export const cosineSimilarity = (
  a: ArrayLike<number>,
  b: ArrayLike<number>
): number => {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa === 0 || bb === 0) return 0;
  return ab / (Math.sqrt(aa) * Math.sqrt(bb));
};

/**
 * Atlas `$vectorSearch` with similarity "cosine" returns a score normalised to
 * [0, 1] as (1 + cosine) / 2. Convert back so thresholds stay in one unit.
 */
export const atlasScoreToCosine = (score: number) => score * 2 - 1;
