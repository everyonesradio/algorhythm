/**
 * Embedding model registry.
 *
 * Every vector stored in MongoDB is tagged with the `model` key it was produced
 * with. Queries filter on that key, so vectors from different models never get
 * compared. To switch models: add an entry here, re-run the seeder with
 * `--model <key>`, then flip ACTIVE_EMBEDDING_MODEL. Old and new vectors can
 * live side by side during the migration.
 */

export type EmbeddingModelKey = "clip-vit-b32" | "dinov2-small";

export type EmbeddingModelConfig = {
  key: EmbeddingModelKey;
  /** Hugging Face repo with ONNX weights (transformers.js compatible). */
  hfId: string;
  /** Output vector size, must match the Atlas vector index definition. */
  dims: number;
  /** How to pull the image vector out of the model output. */
  kind: "clip" | "dinov2";
  /**
   * Weight precision. The SAME dtype must be used for seeding (Node) and
   * scanning (browser), otherwise the vectors drift apart slightly.
   * q8 keeps the browser download at roughly a quarter of fp32.
   */
  dtype: "fp32" | "q8";
};

export const EMBEDDING_MODELS: Record<EmbeddingModelKey, EmbeddingModelConfig> =
  {
    // Default. Robust to lighting/angle changes, and shares a text space, which
    // later enables "search by description" and zero-shot genre tags.
    "clip-vit-b32": {
      key: "clip-vit-b32",
      hfId: "Xenova/clip-vit-base-patch32",
      dims: 512,
      kind: "clip",
      dtype: "q8",
    },
    // Alternative. Self-supervised features that are strong at near-duplicate /
    // instance retrieval (same artwork, different photo). Smaller vectors.
    "dinov2-small": {
      key: "dinov2-small",
      hfId: "Xenova/dinov2-small",
      dims: 384,
      kind: "dinov2",
      dtype: "q8",
    },
  };

export const ACTIVE_EMBEDDING_MODEL: EmbeddingModelKey = "clip-vit-b32";

export const getEmbeddingModel = (key: EmbeddingModelKey = ACTIVE_EMBEDDING_MODEL) =>
  EMBEDDING_MODELS[key];

/** Name of the Atlas Vector Search index on the CoverEmbedding collection. */
export const COVER_VECTOR_INDEX = "cover_vector_index";
