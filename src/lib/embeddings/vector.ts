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

export const atlasScoreToCosine = (score: number) => score * 2 - 1;
